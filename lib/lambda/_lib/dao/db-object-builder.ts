export type ConvertObjectFilter = { exclude?:string[], include?:string[], setNull?:boolean };

export const wrap = (raw:any) => {
  const wrapped = {} as any;
  if(typeof raw === 'string') {
    wrapped.S = raw;
  }
  else if(typeof raw === 'number' || typeof raw === 'bigint') {
    wrapped.N = raw;
  }
  else if(typeof raw === 'boolean') {
    wrapped.BOOL = raw;
  }
  else if(raw === null || typeof raw === 'undefined') {
    wrapped.NULL = true;
  }
  else if(raw instanceof Object) {
    wrapped.M = convertToApiObject(raw);
  }
  return wrapped;
}

/**
 * This function takes a javascript object or value and converts into the equivalent for dynamodb
 * low-level api commands. For example:
 *   { fld: 'fld-value' }
 * becomes...
 *   { fld: { S: 'fld-value } }
 */
export const convertToApiObject = (obj:any, filter?:ConvertObjectFilter) => {
  const excludeField = (fld:string) => {
    if(filter) {
      if(filter.include && filter.include.includes(fld) == false) {
        return true;
      }
      if(filter.exclude && filter.exclude.includes(fld)) {
        return true;
      }
    }
    return false;
  }
  const converted = {} as any;
  for(const key in obj) {
    if(excludeField(key)) {
      continue;
    }
    const val = obj[key];
    if(val === null || typeof val === 'undefined') {
      if(filter?.setNull) {
        converted[key] = wrap(obj[key]);
      }
    }
    else if(val instanceof Array) {
      const list = [] as any[];
      for(const o in val) {
        list.push(wrap(val[o]));
      }
      converted[key] = { L: list };      
    }
    else {
      converted[key] = wrap(obj[key]);
    }
  }
  return converted;
}

/**
 * This function takes a dynamodb low-level api command object and and converts into the equivalent javascript
 * object or value. For example:
 *   { fld: { S: 'fld-value } }
 * becomes...
 *   { fld: 'fld-value' }
 */
export const convertFromApiObject = (obj:any) => {
  const flatten = (obj:any) => {
    const isISODate = (d:string) => {
      return /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)((-(\d{2}):(\d{2})|Z)?)$/.test(d);
    }
    let flat:any;
    if(obj.S) {
      flat = isISODate(obj.S) ? new Date(Date.parse(obj.S)) : obj.S;
    }
    else if(obj.N) {
      if(/\./.test(obj.N)) {
        flat = Number.parseFloat(obj.N);
      }
      else {
        if((obj.N+'').endsWith('n')) {
          flat = BigInt((obj.N+'').replace('n', ''))
        }
        else {
          var i = parseInt(obj.N);
          flat = Number.isSafeInteger(i) ? i : BigInt(obj.N);
        }
      }
    }
    else if(obj.BOOL) {
      flat = new Boolean(obj.BOOL).valueOf()
    }
    else if(obj.NULL) {
      flat = null;
    }
    else if(obj.M) {
      flat = convertFromApiObject(obj.M);
    }
    return flat;
  }
  const flattened = {} as any;
  for(const key in obj) {
    const val = obj[key];
    if(val === undefined) {
      flattened[key] = undefined;
    }
    else if(val.L) {
      const list = [] as any[];
      for(const o in val.L) {
        list.push(flatten(val.L[o]));
      }
      flattened[key] = list;
    }
    else {
      flattened[key] = flatten(val);
    }
  }
  return flattened;
}