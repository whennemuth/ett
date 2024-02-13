import { AttributeValue, UpdateItemCommandInput } from "@aws-sdk/client-dynamodb";
import { wrap } from './db-object-builder';
import { Entity, EntityFields, Invitation, InvitationFields, User, UserFields } from "./entity";

/**
 * Type for builder with single method buildUpdateItem, where optional index refers to the index of a 
 * list member that is the target of the update within an item. Else the update refers to the item itself.
 */
export type Builder = { buildUpdateItem(index?:number): UpdateItemCommandInput };

let item: UpdateItemCommandInput;
/**
 * An instance of this builder builds the DynamoDBClient.UpdateItemCommand UpdateItemCommandInput parameter,
 * based on what it finds in the provided source object. The source object should exclude all fields that have
 * not changed as it is impractical to perform updates to fields that and would result in no change.
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/UpdateItemCommand/
 */
export function getUpdateCommandBuilderInstance(info:User|Invitation|Entity, _type:'user'|'invitation'|'entity', TableName:string): Builder {
  item = { 
    TableName, 
    ExpressionAttributeNames: {} as Record<string, string>,
    ExpressionAttributeValues: {} as Record<string, AttributeValue>,
  } as UpdateItemCommandInput;

  switch(_type) {
    case 'user':
      return userUpdate(info as User);
    case "invitation":
      return invitationUpdate(info as Invitation);
    case "entity":
      return entityUpdate(info as Entity);
    default:
      return {} as Builder;
  }
};

/**
 * Turn an object like { fldname: { S: 'fld-value' }} into 'fldname = { "S": "fld-value" }'
 * @param fld 
 * @returns 
 */
const getFldSetStatement = (fld:any):string => {
  const key = Object.keys(fld)[0];
  return `${key} = ${fld[key]}`;
};

/**
 * Turn an object like 
 *   { fldname1: { L: [{ M: { fldname2: { S: 'fld-value' }}}] }} 
 * into 
 *   fldname1 = list_append(fldname1, { M: { fldname2: { S: 'fld-value' }}})
 * @param fld 
 * @returns 
 */
const getFldAppendStatement = (fld:any):string => {
  const key = Object.keys(fld)[0];
  let val = fld[key];
  if(val.L) {
    val = val.L[0];
  }
  return `${key} = list_append(${key}, ${val})`;
}

/**
 * Create the command to modify an user in the target table, or add a new one if it does not exist.
 * @param user 
 * @param excludeFields 
 * @returns 
 */
const userUpdate = (user:User):Builder => {
  const buildUpdateItem = () => {
    if( ! user.update_timestamp) {
      user.update_timestamp = new Date().toISOString();
    }
    const key = {
      [ UserFields.email ]: { S: user.email },
      [ UserFields.entity_id ]: { S: user.entity_id }
    } as Record<string, AttributeValue>;
    item.Key = key;
    const fieldset = [] as any[];
    let fld: keyof typeof UserFields;
    for(fld in UserFields) {
      if(key[fld]) continue;
      if( ! user[fld]) continue;
      item.ExpressionAttributeValues![`:${fld}`] = wrap(user[fld]);
      item.ExpressionAttributeNames![`#${fld}`] = fld;
      fieldset.push({ [`#${fld}`]: `:${fld}`})
    }
    item.UpdateExpression = `SET ${fieldset.map((o:any) => { return getFldSetStatement(o); }).join(', ')}`
    return item;
  }
  return { buildUpdateItem };
};

/**
 * Create the command to modify an invitation in the target table, or add a new one if it does not exist.
 * @param invitation 
 * @param excludeFields 
 * @returns 
 */
const invitationUpdate = (invitation:Invitation):Builder => {
  const buildUpdateItem = () => {
    const key = {
      [ InvitationFields.code ]: { S: invitation.code }
    } as Record<string, AttributeValue>;
    item.Key = key;
    const fieldset = [] as any[];
    let fld: keyof typeof InvitationFields;
    for(fld in InvitationFields) {
      if(key[fld]) continue;
      if( ! invitation[fld]) continue;
      item.ExpressionAttributeValues![`:${fld}`] = wrap(invitation[fld]);
      item.ExpressionAttributeNames![`#${fld}`] = fld;
      fieldset.push({ [`#${fld}`]: `:${fld}`})
    }
    item.UpdateExpression = `SET ${fieldset.map((o:any) => { return getFldSetStatement(o); }).join(', ')}`
    return item;
  }  
  return { buildUpdateItem };
};

const entityUpdate = (entity:Entity):Builder => {
  const buildUpdateItem = () => {
    if( ! entity.update_timestamp) {
      entity.update_timestamp = new Date().toISOString();
    }
    const key = {
      [ EntityFields.entity_id ]: { S: entity.entity_id }
    } as Record<string, AttributeValue>;
    item.Key = key;
    const fieldset = [] as any[];
    let fld: keyof typeof EntityFields;
    for(fld in EntityFields) {
      if(key[fld]) continue;
      if( ! entity[fld]) continue;
      item.ExpressionAttributeValues![`:${fld}`] = wrap(entity[fld]);
      item.ExpressionAttributeNames![`#${fld}`] = fld;
      fieldset.push({ [`#${fld}`]: `:${fld}`})
    }
    item.UpdateExpression = `SET ${fieldset.map((o:any) => { return getFldSetStatement(o); }).join(', ')}`
    return item;
  }
  return { buildUpdateItem };
};