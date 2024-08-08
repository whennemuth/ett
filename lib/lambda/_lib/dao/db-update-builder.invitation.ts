import { AttributeValue } from "@aws-sdk/client-dynamodb";
import { wrap } from './db-object-builder';
import { Builder, getBlankCommandInput, getFldSetStatement } from "./db-update-builder-utils";
import { Invitation, InvitationFields } from "./entity";

/**
 * Create the command to modify an invitation in the target table, or add a new one if it does not exist.
 * @param TableName 
 * @param invitation 
 * @returns 
 */
export const invitationUpdate = (TableName:string, invitation:Invitation):Builder => {
  const buildUpdateItemCommandInput = () => {
    const key = {
      [ InvitationFields.code ]: { S: invitation.code }
    } as Record<string, AttributeValue>;
    const item = getBlankCommandInput(TableName, key);
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
  return { buildUpdateItemCommandInput };
};