import { AbstractRoleApi, IncomingPayload, OutgoingPayload, LambdaProxyIntegrationResponse } from '../../../role/AbstractRole';
import { DAOUser, DAOFactory, DAOEntity } from '../../_lib/dao/dao';
import { YN } from '../../_lib/dao/entity';
import { InvitationEmail } from '../../_lib/invitation/Invitation'
import { SignupLink } from '../../_lib/signupLinks/SignupLink';

/**
 * This function performs all actions a system administrator can take to create/modify entities and 
 * invite "non-public" users (admins, authorized individuals)
 * @param _event 
 * @returns 
 */
export enum Task {
  CREATE_ENTITY = 'create_entity',
  UPDATE_ENTITY = 'update_entity',
  DEACTIVATE_ENTITY = 'deactivate_entity',
  INVITE_USER = 'invite_user',
  PING = 'ping'
}

export const handler = async (event:any):Promise<LambdaProxyIntegrationResponse> => {
  let statusCode = 200;
  let outgoingPayload = {} as OutgoingPayload;
  try {
    console.log(JSON.stringify(event, null, 2)); 

    const payloadJson = event.headers[AbstractRoleApi.ETTPayloadHeader];
    const payload = payloadJson ? JSON.parse(payloadJson) as IncomingPayload : null;
    let { task, parameters } = payload || {};

    if( ! Object.values<string>(Task).includes(task || '')) {
      statusCode = 400;
      outgoingPayload = {
        statusCode: 400,
        statusDescription: 'Bad Request',
        message: `Invalid/Missing task parameter: ${task}`,
        payload: { error: true }
      }
    }
    else {
      console.log(`Performing task: ${task}`);
      switch(task as Task) {
        case Task.CREATE_ENTITY:
          await createEntity(parameters);
          break;
        case Task.UPDATE_ENTITY:
          await updateEntity(parameters);
          break;
        case Task.DEACTIVATE_ENTITY:
          await deactivateEntity(parameters);
          break;
        case Task.INVITE_USER:
          await inviteUser(parameters);
          break;
        case Task.PING:
          statusCode = 200;
          outgoingPayload = { statusCode: 200, statusDescription: 'OK', message: 'Ping!', payload: parameters }
          break;
      } 
    }
  }
  catch(e:any) {
    console.error(e);
    statusCode = 500;
    outgoingPayload = {
      statusCode: 500,
      statusDescription: 'Internal Server Error',
      message: e.message || 'unknown error',
      payload: e
    };
  }

  const response = { 
    isBase64Encoded: false,
    statusCode, 
    headers: {
      'Access-Control-Allow-Headers' : 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent',
      'Access-Control-Allow-Origin': `https://${process.env.CLOUDFRONT_DOMAIN}`,
      'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
      'Access-Control-Allow-Credentials': 'true'
    },
    body: JSON.stringify(outgoingPayload, null, 2),
 };

 console.log(`Response: ${JSON.stringify(response, null, 2)}`);
 return response;
}

const createEntity = async (parms:any) => {
  const { entity_name, description } = parms;
  const dao:DAOEntity = DAOFactory.getInstance({ DAOType: 'entity', Payload: { entity_name, description }}) as DAOEntity;
}

const updateEntity = async (parms:any) => {
  const { entity_name, description, active } = parms;
  const dao:DAOEntity = DAOFactory.getInstance({ DAOType: 'entity', Payload: {  entity_name, description, active }}) as DAOEntity;
}

const deactivateEntity = async (parms:any) => {
  const { entity_name } = parms;
  updateEntity({ entity_name, active:YN.No });
}

/**
 * The cognito userpool client signup link can either have been passed in via the api call as a member
 * of the AbstractRoleApi.ETTPayloadHeader header, else it can be constructed by looking up userpool details via the 
 * userpool name.
 * @param parms 
 * @returns 
 */
const getSigninLink = async (parms:any):Promise<string|undefined> => {
  const { role, link } = parms;
  if(link) return link;
  const userPoolName = process.env.USERPOOL_NAME;
  let linkLookup:string|undefined;
  if(userPoolName) {
    const signupLink = new SignupLink(userPoolName);
    linkLookup = await signupLink.getLinkForRole(role);
  }
  return linkLookup;
}

/**
 * Invite the user via email and log a corresponding tracking entry in the database if successful.
 * @param parms 
 */
const inviteUser = async (parms:any) => {
  const { email, entity_name, role } = parms;
  // RESUME NEXT 4: Put in a check here that prevents an invitation from being sent to an email for a particular
  // role & entity, if any pending inviations exist for the same email, but for a different entity.
  // Make sure this has a unit test.
  const link = await getSigninLink(parms);
  if(link) {    
    const emailInvite = new InvitationEmail({ email, entity_name, role, link });
    if( await emailInvite.send()) {
      await emailInvite.persist();
    }    
  }
  else {
    throw new Error(`Unable to determine the url for ${role} signup`);
  }
}