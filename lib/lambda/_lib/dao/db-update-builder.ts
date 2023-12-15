import { UpdateItemCommandInput } from "@aws-sdk/client-dynamodb";
import { Entity, Invitation, InvitationAttemptFields, InvitationFields, User, UserFields } from "./entity";
import { convertToApiObject } from './db-object-builder';

/**
 * Type for builder with single method buildUpdateItem, where optional index refers to the index of a 
 * list member that is the target of the update within an item. Else the update refers to the item itself.
 */
export type Builder = { buildUpdateItem(index?:number): UpdateItemCommandInput };

let item: UpdateItemCommandInput;
/**
 * An instance of this builder builds the DynamoDBClient.UpdateItemCommand UpdateItemCommandInput parameter,
 * based on what it finds in the provided User object. The User object should exclude all fields that have
 * not changed as it is impractical to perform updates to fields that and would result in no change.
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/UpdateItemCommand/
 */
export function getUpdateCommandBuilderInstance(info:User|Invitation|Entity, TableName:string, task?:'create'|'update'|'append'): Builder {
  item = {
    TableName,
    ExpressionAttributeNames: {},
    ExpressionAttributeValues: {},
  } as UpdateItemCommandInput;

  let builder = {} as Builder;

  if((info as User).sub !== undefined) {
    builder = userUpdate(info as User, [ 
      UserFields.email, 
      UserFields.entity_name 
    ]);
  }
  else if((info as Invitation).attempts !== undefined) {
    switch(task) {
      case 'create':
        builder = invitationAppend(info as Invitation);
        break;
      case 'append':
        builder = invitationAppend(info as Invitation, [ 
          InvitationFields.email, 
          InvitationFields.entity_name 
        ]);
        break;
      case 'update':
        builder = invitationUpdate(info as Invitation, [ 
          InvitationAttemptFields.role, 
          InvitationAttemptFields.link, 
          InvitationAttemptFields.sent_timestamp
        ]);
        break;
    }
  }
  else {
    builder = entityUpdate(info as Entity);
  }
  return builder;
};

/**
 * Turn and object like { fldname: { S: 'fld-value }} into 'fldname = { "S": "fld-value }'
 * @param fld 
 * @returns 
 */
const getFldSetStatement = (fld:any):string => {
  const key = Object.keys(fld)[0];
  return `${key} = ${JSON.stringify(fld[key])}`;
};

/**
 * Turn and object like 
 *   { fldname1: { L: [{ M: { fldname2: { S: 'fld-value }}}] }} 
 * into 
 *   fldname1 = list_append(fldname1, { M: { fldname2: { S: 'fld-value }}})
 * @param fld 
 * @returns 
 */
const getFldAppendStatement = (fld:any):string => {
  const key = Object.keys(fld)[0];
  let val = fld[key];
  if(val.L) {
    val = val.L[0];
  }
  return `${key} = list_append(${key}, ${JSON.stringify(val)})`;
}

/**
 * Create the command to add a new user to the target table
 * @param user 
 * @param excludeFields 
 * @returns 
 */
const userUpdate = (user:User, excludeFields?:string[]):Builder => {
  const buildUpdateItem = () => {
    item.Key = { 
      [ UserFields.email ]: { S: user.email },
      [ UserFields.entity_name ]: { S: user.entity_name }
    }
    const fieldset = [] as any[];
    if( ! user.update_timestamp) {
      user.update_timestamp = new Date().toISOString();
    }
    let fld: keyof typeof UserFields;
    for(fld in UserFields) {
      if(excludeFields && excludeFields.includes(fld)) continue;
      if( ! user[fld]) continue;
      fieldset.push(convertToApiObject({ [fld]: user[fld] }));
    }
    item.UpdateExpression = `SET ${fieldset.map((o:any) => { return getFldSetStatement(o); }).join(', ')}`
    return item;
  }
  return { buildUpdateItem };
};

/**
 * Create the command to either add a new invitation to the target table, or append a new invitation
 * attempt into an existing table item - both will work using an UpdateItemCommand even though one of 
 * them is technically a create. 
 * @param invitation 
 * @param excludeFields 
 * @returns 
 */
const invitationAppend = (invitation:Invitation, excludeFields?:string[]):Builder => {
  const buildUpdateItem = () => {
    item.Key = { 
      [ InvitationFields.email ]: { S: invitation.email },
      [ InvitationFields.entity_name ]: { S: invitation.entity_name }
    }
    const fieldset = [] as any[];
    if( ! invitation.attempts[0].sent_timestamp) {
      invitation.attempts[0].sent_timestamp = new Date().toISOString();
    }
    let fld: keyof typeof InvitationFields;
    for(fld in InvitationFields) {
      if(excludeFields && excludeFields.includes(fld)) continue;
      if( ! invitation[fld]) continue;
      fieldset.push(convertToApiObject({ [fld]: invitation[fld] }));
    }
    const getFldSetStatementFunc = (fld:any):Function => { 
      const key = Object.keys(fld)[0];
      if(key === InvitationFields.attempts) return getFldAppendStatement;
      return getFldSetStatement
    }
    item.UpdateExpression = `SET ${fieldset.map((o:any) => { return getFldSetStatementFunc(o)(o); }).join(', ')}`
    return item;
  }  
  return { buildUpdateItem };
};

const invitationUpdate = (invitation:Invitation, excludeFields?:string[]):Builder => {
  const buildUpdateItem = (index:number) => {
    item.Key = { 
      [ InvitationFields.email ]: { S: invitation.email },
      [ InvitationFields.entity_name ]: { S: invitation.entity_name }
    }
    const fieldset = [] as any[];
    let fld: keyof typeof InvitationAttemptFields;
    for(fld in InvitationAttemptFields) {
      if(excludeFields && excludeFields.includes(fld)) continue;
      if( ! invitation.attempts[0][fld]) continue;
      fieldset.push(convertToApiObject({ [fld]: invitation.attempts[0][fld] }));
    }
    item.UpdateExpression = `SET ${InvitationFields.attempts}[${index}].${fieldset.map((o:any) => { return getFldSetStatement(o); }).join(', ')}`
    return item;
  }  
  return { buildUpdateItem };
};

const entityUpdate = (entity:Entity, excludeFields?:string[]):Builder => {

  const buildUpdateItem = () => {
    return item;
  }
  
  return { buildUpdateItem };
};