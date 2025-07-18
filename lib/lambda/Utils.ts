import { CloudFrontClient, DistributionSummary, ListDistributionsCommand, ListDistributionsResult } from "@aws-sdk/client-cloudfront";
import { exec } from "child_process";
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as ctx from '../../contexts/context.json';
import { IContext } from "../../contexts/IContext";
import { AbstractRoleApi, LambdaProxyIntegrationResponse } from "../role/AbstractRole";
import { DAOEntity, DAOFactory, DAOUser } from "./_lib/dao/dao";
import { Entity, Invitation, User, YN } from "./_lib/dao/entity";
import assert = require("assert");

export type EnvVar = { name:string, value:string };

/**
 * https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-output-format
 * https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-cors.html#apigateway-enable-cors-proxy
 * @param headers 
 */
const addCorsHeaders = (headers:any) => {

  const domain = process.env.PRIMARY_DOMAIN || process.env.CLOUDFRONT_DOMAIN;

  const allowHeaders = [
    'Content-Type',
    'X-Amz-Date',
    'Authorization',
    'X-Api-Key',
    'X-Amz-Security-Token',
    'X-Amz-User-Agent'
  ]

  headers['Access-Control-Allow-Headers'] = allowHeaders.join(',');

  headers['Access-Control-Allow-Origin'] = `https://${domain}`;

  headers['Access-Control-Allow-Methods'] = 'OPTIONS,POST,GET';

  headers['Access-Control-Allow-Credentials'] = 'true';
}

/**
 * Get a standard http response for return value of lambda integrated with api-gateway.
 * @param message 
 * @param statusCode 
 * @returns 
 */
const getResponse = (message:string, statusCode:number, payload?:any): LambdaProxyIntegrationResponse => {
  const headers = {
    "Content-Type": "application/json"
  }
  addCorsHeaders(headers);
  const body = { message } as any;
  if(payload) {
    body.payload = payload;
  }
  const response = {
    isBase64Encoded: false,
    statusCode,
    headers,
    body: JSON.stringify(body)
  };
  log(message);
  if(payload && payload instanceof Error) {
    log(payload);
  }
  else {
    debugLog(response);
  }
  return response;
}

export const unauthorizedResponse = (message:string, payload?:any): LambdaProxyIntegrationResponse => {
  if( ! payload) {
    payload = { unauthorized: true };
  }
  else if(payload.unauthorized == undefined) {
    payload.unauthorized = true;
  }
  return getResponse(message, 401, payload);
}

export const invalidResponse = (message:string, payload?:any): LambdaProxyIntegrationResponse => {
  if( ! payload) {
    payload = { invalid: true };
  }
  else if(payload.invalid == undefined) {
    payload.invalid = true;
  }
  return getResponse(message, 400, payload);
}

export const okResponse = (message:string, payload?:any): LambdaProxyIntegrationResponse => {
  if( ! payload) {
    payload = { ok: true };
  }
  else if(payload.ok == undefined) {
    payload.ok = true;
  }
  return getResponse(message, 200, payload);
}

export const okPdfResponse = (bytes:Uint8Array, filename:string): LambdaProxyIntegrationResponse => {
  if( ! filename.endsWith('.pdf')) {
    filename += '.pdf';
  }
  const headers = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`
  }
  addCorsHeaders(headers);
  // const body = bytesToBase64(bytes);
  const body = Buffer.from(bytes).toString("base64");
  return { isBase64Encoded: true, statusCode:200, headers, body };
}

export const errorResponse = (message:string, payload?:any): LambdaProxyIntegrationResponse => {
  if( ! payload) {
    payload = { error: true };
  }
  else if (payload.error == undefined) {
    payload.error = true;
  }
  const response =  getResponse(message, 500, payload);
  // Log these even if not in "DEBUG" mode
  log(response);
  return response;
}

export const debugLog = (o:any, msg?:string) => {
  if(process.env.DEBUG == 'true') {
    log(o, msg);
  }
  else if(o?.headers?.[AbstractRoleApi.ETTPayloadHeader]) {
    log(o.headers[AbstractRoleApi.ETTPayloadHeader], 'Payload');
  }
}

export const serializeObject = (o:any, seen = new Set()):any => {
  if (o && typeof o === 'object') {
    if (seen.has(o)) return '[Circular]';
    seen.add(o);

    if (Array.isArray(o)) return o.map(item => serializeObject(item, seen));
    return Object.fromEntries(Object.entries(o).map(([key, value]) => [key, serializeObject(value, seen)]));
  }
  return o;
}

const toConsole = (o:any, out:Function, msg?:string) => {
  const output = (suffix:string) => {
    if(msg) msg = msg.endsWith(': ') ? msg : `${msg}: `;
    out(msg ? `${msg}${suffix}` : suffix);
  }
  if(o instanceof Error) {
    console.error(msg);
    console.error(o);
    return;
  }
  if(o instanceof Object) {
    output(JSON.stringify(serializeObject(o), null, 2));
    return;
  }
  output(`${o}`);
}

export const log = (o:any, msg?:string) => {
  toConsole(o, (s:string) => console.log(s), msg);
}

export const warn = (o:any, msg?:string) => {
  toConsole(o, (s:string) => console.warn(s), msg);
}

export const error = (o:any, msg?:string) => {
  toConsole(o, (s:string) => console.error(s), msg);
}

export const mergeResponses = (responses:LambdaProxyIntegrationResponse[]) => {
  // 1) Condense the response bodies into an array of their parsed values.
  const bodies = responses.map(response => {
    return JSON.parse(response.body ?? '{}');
  }) as any[];

  // 2) Determine the highest (probably most severe) status code
  const statusCode = responses.reduce((priorValue, currentValue) => {
    return currentValue.statusCode > priorValue.statusCode ? currentValue : priorValue;
  }, { statusCode:200 }).statusCode;

  const headers = {
    "Content-Type": "application/json"
  }
  addCorsHeaders(headers);
  const response = {
    isBase64Encoded: false,
    statusCode,
    headers,
    body: JSON.stringify(bodies)
  };
  debugLog(response);
  return response;
}

export const isOkStatusCode = (code:any) => {
  return /^2\d+/.test(`${code}`);
}

export const isOk = (response:LambdaProxyIntegrationResponse) => {
  return isOkStatusCode(response.statusCode);
}

/**
 * Lookup a single entity by its primary key (entity_id)
 * @param entity_id 
 * @returns 
 */
export const lookupSingleEntity = async (entity_id:string):Promise<Entity|null> => {
  const dao = DAOFactory.getInstance({
    DAOType: 'entity',
    Payload: { entity_id } as Entity
  }) as DAOEntity;
  return await dao.read() as Entity|null;
}

export const lookupSingleActiveEntity = async (entity_id:string):Promise<Entity|null> => {
  const entity = await lookupSingleEntity(entity_id);
  if(entity && entity.active == YN.No) {
    return null;
  }
  return entity;
}

/**
 * Lookup a single user by their email address and entity membership.
 * @param email 
 * @param entity_id 
 * @returns 
 */
export const lookupSingleUser = async (email:string, entity_id?:string|null):Promise<User|null> => {
  if( ! entity_id) {
    return null;
  }
  const dao = DAOFactory.getInstance({
    DAOType: 'user',
    Payload: { email, entity_id } as User
  }) as DAOUser;
  let user = await dao.read() as User|null;
  if(user && Object.keys(user).length === 0) {
    user = null;
  }
  return user;
}

/**
 * Lookup a user across all entities.
 * @param email 
 * @returns 
 */
export const lookupUser = async (email:string): Promise<User[]> => {
  const dao = DAOFactory.getInstance({
    DAOType: 'user',
    Payload: { email } as User
  }) as DAOUser;
  return await dao.read() as User[];
}

/**
 * Lookup any invitations to the specified entity.
 * @param entity_id 
 * @param role 
 * @returns 
 */
export const lookupPendingInvitations = async (entity_id?:string|null):Promise<Invitation[]> => {
  if( ! entity_id) {
    return [] as Invitation[];
  }
  const dao = DAOFactory.getInstance({ DAOType:'invitation', Payload: { entity_id }});
  let invitations = await dao.read() as Invitation[];
  if( ! (invitations instanceof Array)) {
    invitations = [ invitations ];
  }
// Pending invitations will be those that have not had their emails set yet.
  return invitations.filter(i => i.email == i.code) ?? [];
}

export const lookupDistributionSummary = async (landscape:string):Promise<DistributionSummary|undefined> => {
  const context:IContext = <IContext>ctx;
  const { STACK_ID } = context;
  const client = new CloudFrontClient({});
  const command = new ListDistributionsCommand({});
  const response = await client.send(command) as ListDistributionsResult;
  const distributions = response.DistributionList?.Items?.filter((ds:DistributionSummary) => {
    return ds.Comment && ds.Comment == `${STACK_ID}-${landscape}-distribution`;
  }) as DistributionSummary[]
  if(distributions!.length > 0) {
    return distributions[0];
  }
  return undefined;
}

export const lookupCloudfrontDomain = async (landscape:string):Promise<string|undefined> => {
  const summary = await lookupDistributionSummary(landscape);
  return summary?.DomainName;
}

export const lookupCloudfrontDistributionId = async (landscape:string):Promise<string|undefined> => {
  const summary = await lookupDistributionSummary(landscape);
  return summary?.Id;
}

export const bytesToBase64 = (bytes:Uint8Array) => {
  const binString = Array.from(bytes, (byte) =>
    String.fromCodePoint(byte),
  ).join("");
  return btoa(binString);
}

export const viewHtml = async (html:string) => {
  const { writeFileSync } = await import('fs');
  const { join } = await import('path');
  const { tmpdir } = await import('os');
  const { platform } = await import('process');

  const tmpPath = join(tmpdir(), 'html_table.html');
  let command = '';
  switch (platform) {
    case 'win32':
      command = `start "" "${tmpPath}"`;
      break;
    case 'darwin':
      command = `open "${tmpPath}"`;
      break;
    case 'linux':
      command = `xdg-open "${tmpPath}"`;
      break;
    default:
      console.error('Unsupported platform:', platform);
      return;
  }

  writeFileSync(tmpPath, html, 'utf-8');
  exec(command, (err) => {
    if (err) {
      console.error('Failed to open browser:', err);
    }
  });

}

/**
 * Object for converting an ISO date string to a date and compare it to other date string values
 */
export function ComparableDate(timestamp:any):any {
  let date:Date;
  if(timestamp) {
    date = typeof timestamp == 'string' ? new Date(timestamp) : timestamp;
  }
  else {
    date = new Date(0);
  }
  const before = (_timestamp:any) => {
    const other = ComparableDate(_timestamp);
    return date.getTime() < other.getTime();
  }
  const after = (_timestamp:any) => {
    const other = ComparableDate(_timestamp);
    return date.getTime() > other.getTime();
  }
  const getTime = () => {
    return date.getTime();
  }
  return { before, after, getTime }
}


/** 
 * Get the most recent date from an array of iso formatted date strings 
 */
export const getMostRecent = (timestamps:string[]=[]):string|undefined => {
  if(timestamps.length == 0) {
    return undefined;
  }
  timestamps.sort((a:string, b:string):number => {
    const dateA = new Date(a);
    const dateB = new Date(b);
    return dateB.getTime() - dateA.getTime();
  });
  return timestamps[0];
}


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
export const deepEqual = (obj1:any, obj2:any, parm?:'log.console'|'log.temp'|'alt'):boolean => {
  const log = (obj:string, idx:number) => {
    if( ! parm) return;
    const logMethod = parm.substring(4);
    switch(logMethod) {
      case 'console':
        console.log(JSON.stringify(obj, null, 2))
        break;
      case 'temp':
        const logfile = `${tmpdir()}/log${idx}.json`;
        console.log(`Writing ${logfile}...`)
        writeFileSync(`${logfile}`, JSON.stringify(obj, null, 2), 'utf-8');
        break;
    }
  }

  /**
   * Perform a deep equality check between two objects based on the 2022 assert.deepEqual native nodejs method.
   * @returns 
   */
  const method1 = ():boolean => {
    try {
      assert.deepEqual(obj1, obj2);
      return true;
    }
    catch(e) {
      return false;
    }
  };

  /**
   * Useful if method1 is returning unexpected results and you want a temporary 
   * "second opinion" and/or some logic to step through
   * @returns 
   */
  const method2 = ():boolean => {
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
      if ( ! keys2.includes(key) || ! deepEqual(obj1[key], obj2[key], parm)) {
        return false;
      }
    }
    return true;
  }

  log(obj1, 1);
  log(obj2, 2);

  if(parm && parm == 'alt') {
    return method2();
  }

  return method1();
}

export const fieldsAreEqual = (fld1:any, fld2:any) => {
  const compare1 = fld1 instanceof Date ? fld1.toISOString() : fld1;
  const compare2 = fld2 instanceof Date ? fld2.toISOString() : fld2;
  return compare1 == compare2;
}

export const deepClone = (obj:any) => JSON.parse(JSON.stringify(obj));

/**
 * Get the name of a property in a way that ensures string literals are refactored when changing the property name.
 * Use like this: getPropertyName<MyType>("myPropertyName");
 * @param property 
 * @returns 
 */
export const getPropertyName = <T>(property: keyof T): string => {
  return String(property);
}