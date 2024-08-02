import { AttributeValue } from "@aws-sdk/client-dynamodb";
import { Builder, getBlankCommandInput, getFldSetStatement } from "./db-update-builder-utils";
import { wrap } from './db-object-builder';
import { Config, ConfigFields } from "./entity";


/**
 * Create the command to modify an config item in the target table, or add a new one if it does not exist.
 * @param TableName 
 * @param config 
 * @returns 
 */
export const configUpdate = (TableName:string, config:Config):Builder => {
  const buildUpdateItemCommandInput = () => {
    if( ! config.update_timestamp) {
      config.update_timestamp = new Date().toISOString();
    }
    const key = {
      [ ConfigFields.name ]: { S: config.name }
    } as Record<string, AttributeValue>;
    const item = getBlankCommandInput(TableName, key);
    const fieldset = [] as any[];
    let fld: keyof typeof ConfigFields;
    for(fld in ConfigFields) {
      if(key[fld]) continue;
      if( ! config[fld]) continue;
      item.ExpressionAttributeValues![`:${fld}`] = wrap(config[fld]);
      item.ExpressionAttributeNames![`#${fld}`] = fld;
      fieldset.push({ [`#${fld}`]: `:${fld}`})
    }
    item.UpdateExpression = `SET ${fieldset.map((o:any) => { return getFldSetStatement(o); }).join(', ')}`
    return item;
  }
  return { buildUpdateItemCommandInput };
};