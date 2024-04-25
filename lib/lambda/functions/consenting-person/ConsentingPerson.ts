import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { DAOFactory } from "../../_lib/dao/dao";
import { Entity, Roles, User, YN } from "../../_lib/dao/entity";
import { ExhibitData } from "../../_lib/pdf/ExhibitForm";
import { debugLog, errorResponse, invalidResponse, log, okResponse } from "../Utils";
import { ExhibitEmail, FormTypes } from "./ExhibitEmail";

export enum Task {
  SEND_AFFILIATE_DATA = 'send-affliate-data',
  PING = 'ping'
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
      return invalidResponse(`Invalid/Missing task parameter: ${task}`);
    }
    else if( ! parameters) {
      return invalidResponse(`Missing parameters parameter for ${task}`);
    }
    else {
      log(`Performing task: ${task}`);
      const callerUsername = event?.requestContext?.authorizer?.claims?.username;
      const callerSub = callerUsername || event?.requestContext?.authorizer?.claims?.sub;
      switch(task as Task) {
        case Task.SEND_AFFILIATE_DATA:
          const { exhibit_data } = parameters;
          return await processExhibitData(exhibit_data);
      }
    }
  }
  catch(e:any) {
    console.error(e);
    return errorResponse(`Internal server error: ${e.message}`);
  }
}

/**
 * Send full exhibit form to each authorized individual of the entity and excerpts each affiliate.
 * @param entity_id 
 * @param data 
 * @returns 
 */
export const processExhibitData = async (data:ExhibitData):Promise<LambdaProxyIntegrationResponse> => {
  if( ! data) {
    return invalidResponse('Missing exhibit form data!');
  }

  let { affiliates, entity_id } = data;
  if( ! affiliates) {
    return invalidResponse('Missing affiliate records in exhibit form data!');
  }

  // Get the entity
  const daoEntity = DAOFactory.getInstance({ DAOType:"entity", Payload: { entity_id }});
  const entity = await daoEntity.read() as Entity;

  // Get the authorized individuals of the entity.
  const daoUser = DAOFactory.getInstance({ DAOType:'user', Payload: { entity_id }});
  let users = await daoUser.read() as User[];
  users = users.filter(user => user.active == YN.Yes && (user.role == Roles.RE_AUTH_IND || user.role == Roles.RE_ADMIN));

  // Send the full exhibit form to each authorized individual and the RE admin.
  for(let i=0; i<users.length; i++) {
    await new ExhibitEmail(data, FormTypes.FULL, entity).send(users[i].email);
    // TODO: Make database record of exhibit form. Make sure it only lasts for 48 hours, enough time for 
    // authorized individuals to make disclosure requests which will contain single exhibit form "extracts" 
    // based on this db record as attachments.
  }

  return okResponse('Ok');
}