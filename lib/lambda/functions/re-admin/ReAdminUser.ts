import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from '../../../role/AbstractRole';
import { lookupEmail } from '../../_lib/cognito/Lookup';
import { DAOEntity, DAOFactory, DAOInvitation } from '../../_lib/dao/dao';
import { ENTITY_WAITING_ROOM } from '../../_lib/dao/dao-entity';
import { Entity, Invitation, Role, Roles, User, YN } from '../../_lib/dao/entity';
import { UserInvitation } from '../../_lib/invitation/Invitation';
import { debugLog, errorResponse, invalidResponse, log, lookupCloudfrontDomain, lookupPendingInvitations, lookupSingleEntity, lookupSingleUser, lookupUser, okResponse } from "../Utils";

export enum Task {
  CREATE_ENTITY = 'create_entity',
  UPDATE_ENTITY = 'update_entity',
  DEACTIVATE_ENTITY = 'deactivate_entity',
  INVITE_USER = 'invite_user',
  PING = 'ping'
}

/**
 * This function performs all actions a RE_ADMIN can take to create/modify entities and 
 * invite authorized individuals to the entity.
 * @param event 
 * @returns 
 */
export const handler = async (event:any):Promise<LambdaProxyIntegrationResponse> => {
  try {

    debugLog(event);
    
    const payloadJson = event.headers[AbstractRoleApi.ETTPayloadHeader];
    const payload = payloadJson ? JSON.parse(payloadJson) as IncomingPayload : null;
    let { task, parameters } = payload || {};

    if( ! Object.values<string>(Task).includes(task || '')) {
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
        case Task.CREATE_ENTITY:
          return await createEntity(parameters, { sub:callerSub, role:Roles.RE_ADMIN } as User);
        case Task.UPDATE_ENTITY:
          return updateEntity(parameters);
        case Task.DEACTIVATE_ENTITY:
          return await deactivateEntity(parameters);
        case Task.INVITE_USER:
          return await inviteUser(parameters, Roles.RE_ADMIN, callerSub);
        case Task.PING:
          return okResponse('Ping!', parameters)
      } 
    }
  }
  catch(e:any) {
    return errorResponse(`Internal server error: ${e.message}`);
  }
}

export const createEntity = async (parms:any, reAdmin?:User):Promise<LambdaProxyIntegrationResponse> => {
  const { entity_name, description } = parms;

  // Create the entity
  const daoEntity = DAOFactory.getInstance({ 
    DAOType: 'entity', 
    Payload: { entity_name, description }
  }) as DAOEntity;
  await daoEntity.create();
  const new_entity_id = daoEntity.id();

  if(reAdmin) {

    // Lookup in cognito the email of the RE_ADMIN that is creating an entity
    // TODO: Figure out a way to get the event.requestContext.authorizer.claims object to include this email value.
    const creatorEmail = await lookupEmail(
      process.env.USERPOOL_ID || '', 
      reAdmin.sub, 
      process.env.REGION || ''
    );

    if(creatorEmail) {

      await updateReAdminInvitationWithNewEntity(creatorEmail, new_entity_id);

      await updateReAdminUserRecordWithNewEntity(creatorEmail, new_entity_id);
    }
  }

  return okResponse('Ok', { entity_id: new_entity_id });
}

/**
 * Update the invitation record(s) of an RE_ADMIN so that it/they reflect a new entity and keeps
 * ENTITY_WAITING_ROOM from building up with RE_ADMIN entries.
 * @param reAdminEmail 
 * @param new_entity_id 
 */
const updateReAdminInvitationWithNewEntity = async (reAdminEmail:string, new_entity_id:string) => {
  // Get the "homeless" invitation for the RE_ADMIN. This will be found by email hanging out in the waiting room.
  // There may be more than one if a SYS_ADMIN invited the RE_ADMIN again before the original invitation is accepted.
  let daoInvitation = DAOFactory.getInstance({ 
    DAOType: 'invitation', 
    Payload: { email:reAdminEmail, entity_id:ENTITY_WAITING_ROOM } as Invitation
  });
  const homelessInvitations = await daoInvitation.read() as Invitation[];
  if(homelessInvitations.length == 0) {
    console.error(`Invalid state: RE_ADMIN ${reAdminEmail} has no invitation record`);
  }

  // Apply the new entity id to the invitation(s) for the RE_ADMIN
  homelessInvitations.forEach((invitation) => {
    daoInvitation = DAOFactory.getInstance({ 
      DAOType:'invitation', 
      Payload: { code: invitation.code, entity_id:new_entity_id } as Invitation
    });
  })
}

/**
 * Update the user record of a "entityless" RE_ADMIN so that it reflects a new entity.
 * @param reAdminEmail 
 * @param new_entity_id 
 */
const updateReAdminUserRecordWithNewEntity = async (reAdminEmail:string, new_entity_id:string) => {
  const daoUser = DAOFactory.getInstance({
    DAOType: 'user',
    Payload: { email:reAdminEmail, entity_id:new_entity_id } as User
  });
  await daoUser.update();
}

export const updateEntity = async (parms:any):Promise<LambdaProxyIntegrationResponse> => {
  const { entity_id, entity_name, description, active } = parms;
  const dao:DAOEntity = DAOFactory.getInstance({ DAOType: 'entity', Payload: {  entity_id, entity_name, description, active }}) as DAOEntity;
  await dao.update();
  return okResponse('Ok');
}

export const deactivateEntity = async (parms:any):Promise<LambdaProxyIntegrationResponse> => {
  const { entity_id } = parms;
  return await updateEntity({ entity_id, active:YN.No });
}

/**
 * Invite the user via email and log a corresponding tracking entry in the database if successful.
 * @param parms 
 */
export const inviteUser = async (parms:any, inviterRole:Role, inviterCognitoUserName?:string): Promise<LambdaProxyIntegrationResponse> => {
  const { email, entity_id, role } = parms;
  const cloudfrontDomain = process.env.CLOUDFRONT_DOMAIN;
  if(cloudfrontDomain) {
    let link = `https://${cloudfrontDomain}?action=acknowledge`;
    if(entity_id) {
      link = `${link}&entity_id=${entity_id}`
    }

    // Prevent RE_ADMIN from inviting any other role than AUTH_IND
    if(inviterRole == Roles.RE_ADMIN && role != Roles.RE_AUTH_IND) {
      return invalidResponse(`An ${Roles.RE_ADMIN} can only invite a ${Roles.RE_AUTH_IND}`);
    }

    // Get the name of the associated entity.
    let entity:Entity|null = null;
    if(entity_id) {
      entity = await lookupSingleEntity(entity_id) as Entity;
    }

    // Prevent inviting the user if the entity is deactivated.
    if(entity && entity.active == YN.No) {
      return invalidResponse(`Entity ${entity_id} has been deactivated`);
    }

    // Prevent AUTH_IND users from being invited to non-existent entities
    if( ! entity && role == Roles.RE_AUTH_IND) {
      return invalidResponse(`Entity ${entity_id} does not exist`)
    }

    // Prevent inviting the user if they already have an account with the specified entity.
    const user = await lookupSingleUser(email, entity_id);
    if(user) {
      return invalidResponse(`Invitee ${email} has already accepted invitation for entity ${entity_id}`);
      // TODO: What if the user is deactivated? Should an invitation be allowed that reactivates them instead of creating a new user?
    }

    // Prevent an RE_ADMIN from inviting someone to an entity they are not themselves a member of.
    if(inviterCognitoUserName && inviterRole == Roles.RE_ADMIN) {
      const inviterEmail = await lookupEmail(
        process.env.USERPOOL_ID || '', 
        inviterCognitoUserName, 
        process.env.REGION || ''
      );
      if(inviterEmail) {
        const inviterAsReAdminInSameEntity:User[] = (await lookupUser(inviterEmail)).filter((user) => {
          return user.role == Roles.RE_ADMIN && user.entity_id == entity_id;
        });
        if(inviterAsReAdminInSameEntity.length == 0) {
          return invalidResponse(`RE_ADMIN ${inviterEmail} is attempting to invite an authorized individual to entity they are not themselves a member of`);
        }
      }
    }

    // Prevent inviting a non-RE_AUTH_IND user if somebody has already been invited for the same role in the same entity.
    const pendingInvitations = await lookupPendingInvitations(entity_id) as Invitation[];
    const conflictingInvitations = pendingInvitations.filter((invitation) => {
      if(invitation.retracted_timestamp) return false;
      if(entity_id == ENTITY_WAITING_ROOM) return false; // Anybody can be invited into the waiting room.
      if(role == Roles.RE_AUTH_IND) return false; // You can invite any number of AUTH_IND users to an entity.
      if(invitation.role != role) return false;
      return true;
    });
    if(conflictingInvitations.length > 0) {
      return invalidResponse(`One or more individuals already have outstanding invitations for role: ${role} in entity: ${entity_id}`);
    }
    
    // Instantiate an invitation
    const emailInvite = new UserInvitation(
      { entity_id, email, role } as Invitation, 
      link, 
      entity?.entity_name || ENTITY_WAITING_ROOM);
    
    // Send the invitation
    if( await emailInvite.send()) {
      const msg = `Invitation successfully sent: ${emailInvite.code}`
      log(msg);
      return okResponse(msg, { invitation_code: emailInvite.code });
    }
    else {
      const msg = `Invitation failure: ${emailInvite.code}`;
      log(msg);
      return errorResponse(msg);
    } 
  }
  else {
    return errorResponse(`Unable to determine the url for ${role} signup`);
  }
}


/**
 * RUN MANUALLY: Modify the task, landscape, email, role, & entity_id as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY') {

  const task = Task.INVITE_USER;
  const landscape = 'dev';

  lookupCloudfrontDomain(landscape).then((cloudfrontDomain) => {
    if( ! cloudfrontDomain) {
      throw('Cloudfront domain lookup failure');
    }
    process.env.DYNAMODB_INVITATION_TABLE_NAME = 'ett-invitations';
    process.env.DYNAMODB_USER_TABLE_NAME = 'ett-users';
    process.env.DYNAMODB_ENTITY_TABLE_NAME = 'ett-entities'
    process.env.CLOUDFRONT_DOMAIN = cloudfrontDomain;
    process.env.REGION = 'us-east-2'
    process.env.DEBUG = 'true';

    const payload = {
      task,
      parameters: {
        email: 'wrh@bu.edu',
        role: Roles.RE_AUTH_IND,
        entity_id: ''
      }
    } as IncomingPayload;

    const _event = {
      headers: {
        [AbstractRoleApi.ETTPayloadHeader]: JSON.stringify(payload)
      }
    }

    return handler(_event);

  }).then(() => {
    console.log(`${task} complete.`)
  }).catch((reason) => {
    console.error(reason);
  });
 
}