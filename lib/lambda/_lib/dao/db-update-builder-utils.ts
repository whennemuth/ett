import { AttributeValue, UpdateItemCommandInput } from "@aws-sdk/client-dynamodb";
import assert = require("assert");
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';

/**
 * Type for builder with single method buildUpdateItemCommandInput, where optional index refers to the index of a 
 * list member that is the target of the update within an item. Else the update refers to the item itself.
 */
export type Builder = { buildUpdateItemCommandInput(index?:number): UpdateItemCommandInput|UpdateItemCommandInput[] };

export const getBlankCommandInput = (TableName:string, Key:Record<string, AttributeValue>):UpdateItemCommandInput => {
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
export const getFldSetStatement = (fld:any):string => {
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
export const getListAppendStatement = (fld:any):string => {
  const key = Object.keys(fld)[0];
  let val = fld[key];
  if(val.L) {
    val = val.L[0];
  }
  return `${key} = list_append(${key}, ${val})`;
}

/**
 * Determine if two objects are equal from a full depth comparison.
 * @param obj1 
 * @param obj2 
 * @param log 
 * @returns 
 */
export const deepEqual = (obj1:any, obj2:any, log?:'console'|'temp'|'tmp'):boolean => {
  const _log = (obj:string, idx:number) => {
    switch(log) {
      case 'console':
        console.log(JSON.stringify(obj, null, 2))
        break;
      case 'temp': case 'tmp':
        const logfile = `${tmpdir()}/log${idx}.json`;
        console.log(`Writing ${logfile}...`)
        writeFileSync(`${logfile}`, JSON.stringify(obj, null, 2), 'utf-8');
        break;
    }
  }

  const method1 = ():boolean => {
    if (obj1 === obj2) {
      return true;
    }
    if(obj1 === null || obj2 === null) {
      return false;
    }
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
      return false;
    }
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) {
      return false;
    }
    for (const key of keys1) {
      if ( ! keys2.includes(key) || ! deepEqual(obj1[key], obj2[key])) {
        return false;
      }
    }
    return true;
  }

  const method2 = ():boolean => {
    try {
      assert.deepEqual(obj1, obj2);
      return true;
    }
    catch(e) {
      return false;
    }
  }

  _log(obj1, 1);
  _log(obj2, 2);

  return method2();
}

