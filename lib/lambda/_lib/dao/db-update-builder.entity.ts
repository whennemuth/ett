import { AttributeValue } from "@aws-sdk/client-dynamodb";
import { Builder, utils } from "./db-update-builder-utils";
import { Entity, EntityFields } from "./entity";

/**
 * Create the command to modify an entity in the target table, or add a new one if it does not exist.
 * @param TableName 
 * @param entity 
 * @returns 
 */
export const entityUpdate = (TableName:string, entity:Entity):Builder => {
  const { getBlankItem, getFldSetStatement, wrap } = utils;
  const buildUpdateItem = () => {
    if( ! entity.update_timestamp) {
      entity.update_timestamp = new Date().toISOString();
    }
    const key = {
      [ EntityFields.entity_id ]: { S: entity.entity_id }
    } as Record<string, AttributeValue>;
    const item = getBlankItem(TableName, key);
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