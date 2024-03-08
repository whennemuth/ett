import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from '../../../role/AbstractRole';
import { lookupEmail } from '../../_lib/cognito/Lookup';
import { DAOEntity, DAOFactory, DAOInvitation } from '../../_lib/dao/dao';
import { ENTITY_WAITING_ROOM } from '../../_lib/dao/dao-entity';
import { Entity, Invitation, Role, Roles, User, UserFields, YN } from '../../_lib/dao/entity';
import { UserInvitation } from '../../_lib/invitation/Invitation';
import { SignupLink } from '../../_lib/invitation/SignupLink';
import { debugLog, errorResponse, invalidResponse, log, lookupCloudfrontDomain, lookupPendingInvitations, lookupSingleEntity, lookupSingleUser, lookupUser, okResponse } from "../Utils";

// TODO: Change underscores to dashes and rebuild stack.
export enum Task {
  CREATE_ENTITY = 'create_entity',
  UPDATE_ENTITY = 'update_entity',
  DEACTIVATE_ENTITY = 'deactivate_entity',
  LOOKUP_USER_CONTEXT = 'lookup_user_context',
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
        case Task.LOOKUP_USER_CONTEXT:
          const { email, role } = parameters;
          return await lookupEntity(email, role);
        case Task.CREATE_ENTITY:
          return await createEntity(parameters, { sub:callerSub, role:Roles.RE_ADMIN } as User);
        case Task.UPDATE_ENTITY:
          return updateEntity(parameters);
        case Task.DEACTIVATE_ENTITY:
          return await deactivateEntity(parameters);
        case Task.INVITE_USER:
          return await inviteUser(parameters, Roles.RE_ADMIN, async (entity_id:string, role?:Role) => {
            return await new SignupLink().getRegistrationLink(entity_id);
          }, callerSub);
        case Task.PING:
          return okResponse('Ping!', parameters)
      } 
    }
  }
  catch(e:any) {
    console.error(e);
    return errorResponse(`Internal server error: ${e.message}`);
  }
}

/**
 * Get the users information, including the entity details, as well as the other users in the entity.
 * 
 * RESUME NEXT: Create a unit test for this function and also test through the frontend.
 * 
 * TODO: Replace the filtering (ie: user.active, user.role, etc) with filters applied by the dynamodb query itself.
 * This would entail modifying the _read and _query functions so that extra attributes supplied in the User object
 * payload parameter that are neither the Partition Key or Sort Key get applied as the equivalent of a 
 * "where clause" (research how to do this in dynamodb). This will become more necessary as CONSENTING_PERSON
 * users start to pile up in the entity and it becomes inefficient to filter them all off with javascript if the
 * use case doesn't even call for including them in the lookup.
 * @param email 
 * @param role 
 * @returns 
 */
export const lookupEntity = async (email:string, role:Role):Promise<LambdaProxyIntegrationResponse> => {

  const userinfo = [ ] as any[];

  // Should return just one user unless the same email has taken the same role at another entity (edge case).
  const getUser = async ():Promise<User[]> => {
    const dao = DAOFactory.getInstance({ DAOType:'user', Payload: { email }});
    let users = await dao.read() as User[];
    users = users.filter(user => user.active == YN.Yes && user.role == role);
    return users;
  }

  // Should return all the other users in the same entity as the current user.
  const getOtherUsers = async (entity_id:string):Promise<User[]> => {
    const dao = DAOFactory.getInstance({ DAOType:'user', Payload: { entity_id }});
    let users = await dao.read() as User[];
    users = users.filter(user => user.active == YN.Yes && user.email != email);
    return users;
  }

  // Should return the entity details.
  const getEntity = async (entity_id:string):Promise<Entity|null> => {
    const dao = DAOFactory.getInstance({ DAOType:'entity', Payload: { entity_id }});
    return await dao.read() as Entity;
  }

  // 1) Get the user specified by the email.
  const users = await getUser();

  // 2) Gather all the information about the entity and the other users in it.
  for(var i=0; i<users.length; i++) {
    var usr = Object.assign({} as any, users[i]);
    delete usr[UserFields.entity_id];
    if(users[i].entity_id == ENTITY_WAITING_ROOM) {
      usr.entity = {};
      continue;
    }
    usr.entity = await getEntity(users[i].entity_id) as Entity|null;
    // Get the other users in the entity and remove the entity_id value (extraneous)
    usr.entity.users = (await getOtherUsers(users[i].entity_id)).map(u => { 
      const retval = Object.assign({}, u) as any;
      delete retval.entity_id;
      return retval;
    });
    userinfo.push(usr);
  }

  // 3) Consolidate the information, and return it in the response payload
  let user = {};
  if(userinfo.length == 1) user = userinfo[0];
  if(userinfo.length > 1) user = userinfo;
  return okResponse('Ok', { user }) 
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
  console.log(`updateReAdminInvitationWithNewEntity: reAdminEmail:${reAdminEmail}, new_entity_id:${new_entity_id}`);
  let daoInvitation = DAOFactory.getInstance({ 
    DAOType: 'invitation', 
    Payload: { email:reAdminEmail, entity_id:ENTITY_WAITING_ROOM } as Invitation
  });
  const homelessInvitations = await daoInvitation.read() as Invitation[];
  if(homelessInvitations.length == 0) {
    console.error(`Invalid state: RE_ADMIN ${reAdminEmail} has no invitation record`);
  }

  // Apply the new entity id to the invitation(s) for the RE_ADMIN
  homelessInvitations.forEach( async (invitation) => {
    daoInvitation = DAOFactory.getInstance({ 
      DAOType:'invitation', 
      Payload: { code: invitation.code, entity_id:new_entity_id } as Invitation
    });
    await daoInvitation.update();
  })
}

/**
 * Update the user record of a "entityless" RE_ADMIN so that it reflects a new entity.
 * @param reAdminEmail 
 * @param new_entity_id 
 */
const updateReAdminUserRecordWithNewEntity = async (reAdminEmail:string, new_entity_id:string) => {
  console.log(`updateReAdminUserRecordWithNewEntity: reAdminEmail:${reAdminEmail}, new_entity_id:${new_entity_id}`);
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
export const inviteUser = async (parms:any, inviterRole:Role, linkGenerator:Function, inviterCognitoUserName?:string): Promise<LambdaProxyIntegrationResponse> => {
  const { email, entity_id=ENTITY_WAITING_ROOM, role } = parms;
  const cloudfrontDomain = process.env.CLOUDFRONT_DOMAIN;
  if(cloudfrontDomain) {

    const link = await linkGenerator(entity_id, role);

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
      return okResponse(msg, { invitation_code: emailInvite.code, invitation_link: emailInvite.link });
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

  // const task = Task.INVITE_USER;
  const task = Task.LOOKUP_USER_CONTEXT;
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
        email: 'warhen@comcast.net',
        role: Roles.RE_ADMIN,
        entity_id: '0952e4a9-060e-4d43-8a7d-7d90f6e04be4'
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