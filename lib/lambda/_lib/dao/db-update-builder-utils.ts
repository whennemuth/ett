import { AttributeValue, UpdateItemCommandInput } from "@aws-sdk/client-dynamodb";
import { wrap } from './db-object-builder';

/**
 * Type for builder with single method buildUpdateItem, where optional index refers to the index of a 
 * list member that is the target of the update within an item. Else the update refers to the item itself.
 */
export type Builder = { buildUpdateItem(index?:number): UpdateItemCommandInput|UpdateItemCommandInput[] };

const getBlankItem = (TableName:string, Key:Record<string, AttributeValue>):UpdateItemCommandInput => {
  return { 
    TableName, Key,
    ExpressionAttributeNames: {} as Record<string, string>,
    ExpressionAttributeValues: {} as Record<string, AttributeValue>,
  } as UpdateItemCommandInput;
}

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
 * export the above utility funtions in a wrapper.
 */
export const utils = { getBlankItem, getFldSetStatement, getFldAppendStatement, wrap };

