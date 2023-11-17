import { UpdateItemCommandInput } from '@aws-sdk/client-dynamodb';
import { User, UserFields, YN } from './entity';

export type Builder = { buildUpdateItem(): any };

/**
 * An instance of this builder builds the DynamoDBClient.UpdateItemCommand UpdateItemCommandInput parameter,
 * based on what it finds in the provided User object. The User object should exclude all fields that have
 * not changed as it is impractical to perform updates to fields that and would result in no change.
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/UpdateItemCommand/
 */
export function getBuilderInstance(userinfo:User, TableName:string): Builder {
  let item = {
    TableName,
    ExpressionAttributeNames: {},
    ExpressionAttributeValues: {},
    Key: {},
    UpdateExpression: 'SET '
  } as UpdateItemCommandInput

  const buildUpdateItem = () => {

    // Set the key
    item.Key = { 
      [ UserFields.email ]: { S: userinfo.email },
      [ UserFields.entity_name ]: { S: userinfo.entity_name }
    }

    /**
     * Set ExpressionAttributeNames, ExpressionAttributeValues, & UpdateExpression
     * @param fldName 
     * @param fldVal 
     */
    const addNameValuePair = (fldName:string, fldVal:string) => {
      (item.ExpressionAttributeNames || {})[`#f${i}`] = fldName || '';
      (item.ExpressionAttributeValues || {})[`:v${i}`] = { S: fldVal };
      item.UpdateExpression += `#f${i} = :v${i}, `;
    }
    
    let i = 1;
    let updatedDate = false;
    let fld: keyof typeof UserFields;
    for(fld in UserFields) {
      if(userinfo[fld]) {
        if(fld == UserFields.email || fld == UserFields.entity_name) {
          continue;
        }
        if(fld == UserFields.update_timestamp) {
          updatedDate = true;
        }
        addNameValuePair(fld, userinfo[fld] || '');
        i++;
      }
    }
    if( ! updatedDate) {
      // Make sure there is an update timestamp applied.
      addNameValuePair(UserFields.update_timestamp, new Date().toISOString());
    }
    if(i > 1) {
      // Trim off the trailing ', '
      item.UpdateExpression = item.UpdateExpression?.substring(0, item.UpdateExpression.length - 2);
    }
    else {
      item.UpdateExpression = '';
    }
    return item;
  }

  return { buildUpdateItem };
}