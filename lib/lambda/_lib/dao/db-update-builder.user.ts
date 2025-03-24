import { AttributeValue } from "@aws-sdk/client-dynamodb";
import { wrap } from './db-object-builder';
import { Builder, getBlankCommandInput, getFldSetStatement } from "./db-update-builder-utils";
import { User, UserFields } from "./entity";

/**
 * Create the command to modify an user in the target table, or add a new one if it does not exist.
 * @param TableName 
 * @param user 
 * @returns 
 */
export const userUpdate = (TableName:string, user:User, removableDelegate:boolean=false):Builder => {
  const buildUpdateItemCommandInput = () => {
    if( ! user.update_timestamp) {
      user.update_timestamp = new Date().toISOString();
    }
    const key = {
      [ UserFields.email ]: { S: user.email.toLowerCase() },
      [ UserFields.entity_id ]: { S: user.entity_id }
    } as Record<string, AttributeValue>;
    const item = getBlankCommandInput(TableName, key);
    const fieldset = [] as any[];
    let fld: keyof typeof UserFields;
    for(fld in UserFields) {
      if(key[fld]) continue;
      if( ! user[fld]) continue;
      const value = fld == UserFields.email ? user[fld].toLowerCase() : user[fld];
      item.ExpressionAttributeValues![`:${fld}`] = wrap(value);
      item.ExpressionAttributeNames![`#${fld}`] = fld;
      fieldset.push({ [`#${fld}`]: `:${fld}`})
    }
    item.UpdateExpression = `SET ${fieldset.map((o:any) => { return getFldSetStatement(o); }).join(', ')}`
    if( ! user[UserFields.delegate] && removableDelegate) {
      // Absence of a delegate means it should be removed if it exists
      item.UpdateExpression +=  ` REMOVE ${UserFields.delegate}`;
    }
    return item;
  } 
  return { buildUpdateItemCommandInput };
};