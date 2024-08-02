import { CloudFrontClient, DistributionSummary, ListDistributionsCommand, ListDistributionsResult } from "@aws-sdk/client-cloudfront";
import { exec } from "child_process";
import { DAOEntity, DAOFactory, DAOInvitation, DAOUser } from "../_lib/dao/dao";
import { Entity, Invitation, User, YN } from "../_lib/dao/entity";

export type LambdaProxyIntegrationResponse<T extends string = string> = {
  isBase64Encoded: boolean;
  statusCode: number;
  headers?: { [headerName in T]: string };
  multiValueHeaders?: { [headerName in T]: string[] };
  body: string
};

/**
 * https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-output-format
 * https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-cors.html#apigateway-enable-cors-proxy
 * @param headers 
 */
const addCorsHeaders = (headers:any) => {

  const allowHeaders = [
    'Content-Type',
    'X-Amz-Date',
    'Authorization',
    'X-Api-Key',
    'X-Amz-Security-Token',
    'X-Amz-User-Agent'
  ]

  headers['Access-Control-Allow-Headers'] = allowHeaders.join(',');

  headers['Access-Control-Allow-Origin'] = `https://${process.env.CLOUDFRONT_DOMAIN}`;

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
  console.log(message);
  if(payload) {
    body.payload = payload;
  }
  const response = {
    isBase64Encoded: false,
    statusCode,
    headers,
    body: JSON.stringify(body)
  };
  debugLog(response);
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

export const errorResponse = (message:string, payload?:any): LambdaProxyIntegrationResponse => {
  if( ! payload) {
    payload = { error: true };
  }
  else if (payload.error == undefined) {
    payload.error = true;
  }
  const response =  getResponse(message, 500, payload);
  if(process.env.DEBUG != 'true') {
    // Log these even if not in "DEBUG" mode
    log(response);
  }
  return response;
}

export const log = (o:any) => {
  if(o instanceof Object) {
    console.log(JSON.stringify(o, null, 2))
    return;
  }
  console.log(o);
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
  const dao = DAOFactory.getInstance({
    DAOType: 'invitation',
    Payload: { entity_id } as Invitation
  }) as DAOInvitation;
  return await dao.read() as Invitation[];
}

export const lookupCloudfrontDomain = async (landscape:string):Promise<string|undefined> => {
  const client = new CloudFrontClient({});
  const command = new ListDistributionsCommand({});
  const response = await client.send(command) as ListDistributionsResult;
  const distributions = response.DistributionList?.Items?.filter((ds:DistributionSummary) => {
    return ds.Comment && ds.Comment == `ett-${landscape}-distribution`;
  }) as DistributionSummary[]
  if(distributions!.length > 0) {
    return distributions[0]!.DomainName;
  }
  return undefined;
}

export const bytesToBase64 = (bytes:Uint8Array) => {
  const binString = Array.from(bytes, (byte) =>
    String.fromCodePoint(byte),
  ).join("");
  return btoa(binString);
}

export const debugLog = (o:any) => {
  if(process.env.DEBUG == 'true') {
    log(o);
  }
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
