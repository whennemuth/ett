import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { lookupUserPoolId } from "../../_lib/cognito/Lookup";
import { DAOFactory } from "../../_lib/dao/dao";
import { ENTITY_WAITING_ROOM } from "../../_lib/dao/dao-entity";
import { Entity, Roles, User, YN, Affiliate, ExhibitForm as ExhibitFormData, Consenter, AffiliateTypes } from "../../_lib/dao/entity";
import { debugLog, errorResponse, invalidResponse, log, lookupCloudfrontDomain, okResponse } from "../Utils";
import { ExhibitEmail, FormTypes } from "./ExhibitEmail";

export enum Task {
  SAVE_AFFILIATE_DATA = 'save-affiliate-data',
  SEND_AFFILIATE_DATA = 'send-affiliate-data',
  GET_CONSENTER = 'get-consenter',
  REGISTER_CONSENT = 'register-consent',
  PING = 'ping'
}

export const INVALID_RESPONSE_MESSAGES = {
  missingOrInvalidTask: 'Invalid/Missing task parameter!',
  missingTaskParms: 'Missing parameters parameter for:',
  missingEmail: 'Missing email parameter',
  missingExhibitData: 'Missing exhibit form data!',
  missingAffiliateRecords: 'Missing affiliates in exhibit form data!',
  invalidAffiliateRecords: 'Affiliate item with missing/invalid value',
  missingEntityId: 'Missing entity_id!',
  missingConsent: 'Consent is required before the requested operation can be performed',
  missingExhibitFormIssuerEmail: 'Missing email of exhibit form issuer!',
  emailFailure: 'Email failed for one or more recipients!'
}

export type ConsenterInfo = {
  consenter:Consenter, activeConsent:boolean, entities?:Entity[]
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
        case Task.GET_CONSENTER:
          return await getConsenterResponse(email);
        case Task.REGISTER_CONSENT:
          return await registerConsent(email);
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


/**
 * Get a consenters database record.
 * @param email 
 * @returns 
 */
export const getConsenterResponse = async (email:string): Promise<LambdaProxyIntegrationResponse> => {
  if( ! email) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingEmail)
  }
  const consenterInfo = await getConsenter(email);
  if( ! consenterInfo) {
    return okResponse(`No such consenter: ${email}`);
  }
  return okResponse('Ok', consenterInfo);
}

/**
 * Get a consenters database record.
 * @param email 
 * @returns 
 */
export const getConsenter = async (email:string, includeEntityList:boolean=true): Promise<ConsenterInfo|null> => {
  const dao = DAOFactory.getInstance({ DAOType: 'consenter', Payload: { email } as Consenter });
  const consenter = await dao.read({ convertDates: false }) as Consenter;
  if( ! consenter) {
    return null;
  }
  const { consented_timestamp, rescinded_timestamp, renewed_timestamp, active } = consenter;
  let activeConsent:boolean = false;
  if(consented_timestamp && `${active}` == YN.Yes) {
    const added:Date = new Date(consented_timestamp);
    const removed:Date = rescinded_timestamp ? new Date(rescinded_timestamp) : new Date(0);
    const restored:Date = renewed_timestamp ? new Date(renewed_timestamp) : new Date(0);
    activeConsent = ( added.getTime() > removed.getTime() ) || ( restored.getTime() >= removed.getTime() );
  }
  let entities:Entity[] = [];
  if(includeEntityList && activeConsent) {
    const entityDao = DAOFactory.getInstance({ DAOType: 'entity', Payload: { active:YN.Yes }});
    const _entities = await entityDao.read({ convertDates: false }) as Entity[];
    entities.push(... _entities.filter((_entity:Entity) => {
      return _entity.entity_id != ENTITY_WAITING_ROOM;
    }));
  }

  const retval = { consenter, activeConsent, entities } as ConsenterInfo;
  debugLog(`Returning: ${JSON.stringify(retval, null, 2)}`);

  return retval;
}

/**
 * Register consent by applying a consented_timestamp value to the consenter database record.
 * @param email 
 * @returns 
 */
export const registerConsent = async (email:string): Promise<LambdaProxyIntegrationResponse> => {
  if( ! email) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingEmail)
  }
  const dao = DAOFactory.getInstance({ DAOType: 'consenter', Payload: { 
    email, 
    consented_timestamp: new Date().toISOString() 
  } as Consenter });

  await dao.update();
  
  return getConsenterResponse(email);
}

/**
 * Save exhibit form submission
 * @param email 
 * @param data 
 * @returns 
 */
export const saveExhibitData = async (email:string, data:ExhibitFormData): Promise<LambdaProxyIntegrationResponse> => {
  // Validate incoming data
  if( ! data) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingExhibitData);
  }

  // Abort if the consenter has not yet consented
  const consenterInfo = await getConsenter(email, false);
  if( ! consenterInfo?.activeConsent) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingConsent);
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
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingExhibitFormIssuerEmail);
  }

  // Validate incoming affiliate data
  if(affiliates && affiliates.length > 0) {
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
  const consenterInfo = await getConsenter(email, false) as ConsenterInfo;
  const { consenter, activeConsent } = (consenterInfo ?? {});

  // Abort if the consenter has not yet consented
  if( ! activeConsent) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingConsent);
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


/**
 * RUN MANUALLY:
 */
const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_CONSENTING_PERSON') {

  const task = Task.REGISTER_CONSENT as Task;
  const landscape = 'dev';
  const region = 'us-east-2';

  lookupCloudfrontDomain(landscape).then((cloudfrontDomain) => {
    if( ! cloudfrontDomain) {
      throw('Cloudfront domain lookup failure');
    }
    process.env.CLOUDFRONT_DOMAIN = cloudfrontDomain;
    return lookupUserPoolId('ett-cognito-userpool', region);
  })
  .then((userpoolId) => {

    process.env.USERPOOL_ID = userpoolId;
    process.env.REGION = region;
    process.env.DEBUG = 'true';

    let payload = {};

    switch(task) {
      case Task.SAVE_AFFILIATE_DATA:
        break;
      case Task.SEND_AFFILIATE_DATA:
        break;
      case Task.GET_CONSENTER:
        payload = {
          task,
          parameters: {
            email: 'cp1@warhen.work'
          }
        };
        break;
      case Task.REGISTER_CONSENT:
        payload = {
          task,
          parameters: {
            signature: "Yosemite Sam",
            fullname: "Yosemite S Sam",
            email: "cp1@warhen.work",
            phone: "+7812224444"
          }
        };
        break;
    }

    let sub = '417bd590-f021-70f6-151f-310c0a83985c';
    let _event = {
      headers: { [AbstractRoleApi.ETTPayloadHeader]: JSON.stringify(payload) },
      requestContext: { authorizer: { claims: { username:sub, sub } } }
    } as any;

    return handler(_event);
  }).then(() => {
    console.log(`${task} complete.`)
  })
  .catch((reason) => {
    console.error(reason);
  });;
}