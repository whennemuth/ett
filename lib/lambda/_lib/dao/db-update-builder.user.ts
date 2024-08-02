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
export const userUpdate = (TableName:string, user:User):Builder => {
  const buildUpdateItemCommandInput = () => {
    if( ! user.update_timestamp) {
      user.update_timestamp = new Date().toISOString();
    }
    const key = {
      [ UserFields.email ]: { S: user.email },
      [ UserFields.entity_id ]: { S: user.entity_id }
    } as Record<string, AttributeValue>;
    const item = getBlankCommandInput(TableName, key);
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
  return { buildUpdateItemCommandInput };
};