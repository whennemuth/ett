import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { DAOFactory } from "../../_lib/dao/dao";
import { Entity, Roles, User, YN, Affiliate, ExhibitForm as ExhibitFormData, Consenter, AffiliateTypes } from "../../_lib/dao/entity";
import { debugLog, errorResponse, invalidResponse, log, okResponse } from "../Utils";
import { ExhibitEmail, FormTypes } from "./ExhibitEmail";

export enum Task {
  SAVE_AFFILIATE_DATA = 'save-affiliate-data',
  SEND_AFFILIATE_DATA = 'send-affiliate-data',
  PING = 'ping'
}

export const INVALID_RESPONSE_MESSAGES = {
  missingOrInvalidTask: 'Invalid/Missing task parameter!',
  missingTaskParms: 'Missing parameters parameter for:',
  missingExhibitData: 'Missing exhibit form data!',
  missingAffiliateRecords: 'Missing affiliates in exhibit form data!',
  invalidAffiliateRecords: 'Affiliate item with missing/invalid value',
  missingEntityId: 'Missing entity_id!',
  missingEmail: 'Missing email of exhibit form issuer!',
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
      const { email, exhibit_data } = parameters;
      switch(task as Task) {
        case Task.SAVE_AFFILIATE_DATA:
          return await saveExhibitData(email, exhibit_data);
        case Task.SEND_AFFILIATE_DATA:
          return await processExhibitData(email, exhibit_data);
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

export const saveExhibitData = async (email:string, data:ExhibitFormData): Promise<LambdaProxyIntegrationResponse> => {
  // Validate incoming data
  if( ! data) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingExhibitData);
  }

  // TODO: Make database record of exhibit form. Make sure it only lasts for 48 hours, enough time for 
  // authorized individuals to make disclosure requests which will contain single exhibit form "extracts" 
  // based on this db record as attachments.
  return invalidResponse('Not implemented yet');
};

/**
 * Send full exhibit form to each authorized individual of the entity.
 * @param data 
 * @returns 
 */
export const processExhibitData = async (email:string, data:ExhibitFormData): Promise<LambdaProxyIntegrationResponse> => {
  // Validate incoming data
  if( ! data) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingExhibitData);
  }
  let { affiliates, entity_id } = data as ExhibitFormData;
  if( ! entity_id ) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingEntityId);
  }
  if( ! email) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingEmail);
  }
  if(affiliates) {
    if(affiliates.length == 0) {
      return invalidResponse(INVALID_RESPONSE_MESSAGES.missingAffiliateRecords);
    }
    for(const affiliate of affiliates) {
      let { affiliateType, email, fullname, org, phone_number, title } = affiliate;

      if( ! Object.values<string>(AffiliateTypes).includes(affiliateType)) {
        return invalidResponse(`${INVALID_RESPONSE_MESSAGES.invalidAffiliateRecords} - affiliatetype: ${affiliateType}`);
      }
      if( ! email) {
        return invalidResponse(`${INVALID_RESPONSE_MESSAGES.invalidAffiliateRecords}: email`);
      }
      if( ! fullname) {
        return invalidResponse(`${INVALID_RESPONSE_MESSAGES.invalidAffiliateRecords}: fullname`);
      }
      if( ! org) {
        return invalidResponse(`${INVALID_RESPONSE_MESSAGES.invalidAffiliateRecords}: org`);
      }
      // TODO: Should phone_number and title be left optional?            
    };
  }
  else {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingAffiliateRecords);
  }

  // Get the consenter
  let daoConsenter = DAOFactory.getInstance({ DAOType: 'consenter', Payload: { email }});
  const consenter = await daoConsenter.read() as Consenter;

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
    var sent:boolean = await new ExhibitEmail(data, FormTypes.FULL, entity, consenter).send(users[i].email);
    if( ! sent) {
      emailFailures.push(users[i].email);
    }
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
    var sent:boolean = await new ExhibitEmail(data, FormTypes.SINGLE, entity, consenter).send(affiliates[i].email);
    if( ! sent) {
      emailFailures.push(affiliates[i].email);
    }
    // TODO: It may instead be ok to send a disclosure request instead of just the single exhibit form.
    //       This is pending confirmation from the client.
    // TODO: Make database record of email
    // TODO: Put some code here to make sure any database records of the same affiliate data that are
    //       pending their 48 hour deletion timeout are deleted now instead.  
  }

  if(emailFailures.length > 0) {
    return errorResponse(INVALID_RESPONSE_MESSAGES.emailFailure, { emailFailures });
  }
  return okResponse('Ok');
}


