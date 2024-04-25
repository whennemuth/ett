import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { DAOFactory } from "../../_lib/dao/dao";
import { Entity, Roles, User, YN } from "../../_lib/dao/entity";
import { Affiliate, ExhibitData } from "../../_lib/pdf/ExhibitForm";
import { debugLog, errorResponse, invalidResponse, log, okResponse } from "../Utils";
import { ExhibitEmail, FormTypes } from "./ExhibitEmail";

export enum Task {
  SEND_AFFILIATE_DATA = 'send-affliate-data',
  PING = 'ping'
}

export const INVALID_RESPONSE_MESSAGES = {
  missingOrInvalidTask: 'Invalid/Missing task parameter!',
  missingTaskParms: 'Missing parameters parameter for:',
  missingExhibitData: 'Missing exhibit form data!',
  missingAffiliateRecords: 'Missing affiliate records in exhibit form data!',
  missingEntityId: 'Missing entity_id!',
  missingFullname: 'Missing fullname of exhibit form issuer!',
  emailFailure: 'Email failed for one or more recipients!'
} 

/**
 * This function performs all actions a CONSENTING_PERSON can take.
 * @param event 
 * @returns 
 */
export const handler = async (event:any):Promise<LambdaProxyIntegrationResponse> => {
  try {
    debugLog(event);
      
    const payloadJson = event.headers[AbstractRoleApi.ETTPayloadHeader];
    const payload = payloadJson ? JSON.parse(payloadJson) as IncomingPayload : null;
    let { task, parameters } = payload || {};

    if( ! Object.values<string>(Task).includes(task || 'undefined')) {
      return invalidResponse(`${INVALID_RESPONSE_MESSAGES.missingOrInvalidTask} ${task}`);
    }
    else if( ! parameters) {
      return invalidResponse(`${INVALID_RESPONSE_MESSAGES.missingTaskParms} ${task}`);
    }
    else {
      log(`Performing task: ${task}`);
      const callerUsername = event?.requestContext?.authorizer?.claims?.username;
      const callerSub = callerUsername || event?.requestContext?.authorizer?.claims?.sub;
      switch(task as Task) {
        case Task.SEND_AFFILIATE_DATA:
          const { exhibit_data } = parameters;
          return await processExhibitData(exhibit_data);
        case Task.PING:
          return okResponse('Ping!', parameters); 
      }
    }
  }
  catch(e:any) {
    console.error(e);
    return errorResponse(`Internal server error: ${e.message}`);
  }
}

/**
 * Send full exhibit form to each authorized individual of the entity.
 * @param data 
 * @returns 
 */
export const processExhibitData = async (data:ExhibitData):Promise<LambdaProxyIntegrationResponse> => {
  // Validate incoming data
  if( ! data) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingExhibitData);
  }
  let { affiliates, entity_id, fullname } = data as ExhibitData;
  if( ! entity_id ) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingEntityId);
  }
  if( ! affiliates) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingAffiliateRecords);
  }
  if( ! fullname) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingFullname);
  }

  // Get the entity
  const daoEntity = DAOFactory.getInstance({ DAOType:"entity", Payload: { entity_id }});
  const entity = await daoEntity.read() as Entity;

  // Get the authorized individuals of the entity.
  const daoUser = DAOFactory.getInstance({ DAOType:'user', Payload: { entity_id }});
  let users = await daoUser.read() as User[];
  users = users.filter(user => user.active == YN.Yes && (user.role == Roles.RE_AUTH_IND || user.role == Roles.RE_ADMIN));

  // Send the full exhibit form to each authorized individual and the RE admin.
  const emailFailures = [] as string[];
  for(let i=0; i<users.length; i++) {
    var sent:boolean = await new ExhibitEmail(data, FormTypes.FULL, entity).send(users[i].email);
    if( ! sent) {
      emailFailures.push(users[i].email);
    }
    // TODO: Make database record of exhibit form. Make sure it only lasts for 48 hours, enough time for 
    // authorized individuals to make disclosure requests which will contain single exhibit form "extracts" 
    // based on this db record as attachments.
  }
  
  // Make sure affiliates is always an array.
  if(affiliates instanceof Array) {
    affiliates = affiliates as Affiliate[];
  }
  else {
    affiliates = [ affiliates ];
  }
  
  // Send the single exhibit form excerpts to each affiliate
  for(let i=0; i<affiliates.length; i++) {
    var sent:boolean = await new ExhibitEmail(data, FormTypes.SINGLE, entity).send(affiliates[i].email);
    if( ! sent) {
      emailFailures.push(affiliates[i].email);
    }
    // TODO: Include completed consent form as second attachment in the email.
    // TODO: Include blank disclosure form as third attachment in the email.
    // TODO: Make database record of email
  }

  if(emailFailures.length > 0) {
    return errorResponse(INVALID_RESPONSE_MESSAGES.emailFailure, { emailFailures });
  }
  return okResponse('Ok');
}