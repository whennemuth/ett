import { IContext } from '../../../../contexts/IContext';
import { DelayedExecutions } from '../../../DelayedExecution';
import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from '../../../role/AbstractRole';
import { lookupEmail, lookupUserPoolId } from '../../_lib/cognito/Lookup';
import { Configurations } from '../../_lib/config/Config';
import { DAOEntity, DAOFactory, DAOUser } from '../../_lib/dao/dao';
import { ENTITY_WAITING_ROOM } from '../../_lib/dao/dao-entity';
import { InvitationCrud } from '../../_lib/dao/dao-invitation';
import { ConfigNames, Entity, Invitation, Role, Roles, User, UserFields, YN } from '../../_lib/dao/entity';
import { UserInvitation } from '../../_lib/invitation/Invitation';
import { SignupLink } from '../../_lib/invitation/SignupLink';
import { debugLog, errorResponse, invalidResponse, isOk, log, lookupCloudfrontDomain, lookupPendingInvitations, lookupSingleActiveEntity, lookupSingleUser, lookupUser, mergeResponses, okResponse } from "../../Utils";
import { ExhibitFormsBucketEnvironmentVariableName } from '../consenting-person/BucketItemMetadata';

export enum Task {
  CREATE_ENTITY = 'create-entity',
  UPDATE_ENTITY = 'update-entity',
  DEACTIVATE_ENTITY = 'deactivate-entity',
  LOOKUP_USER_CONTEXT = 'lookup-user-context',
  INVITE_USERS = 'invite-users',
  INVITE_USER = 'invite-user',
  RETRACT_INVITATION = 'retract-invitation',
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
          var { email, role } = parameters;
          return await lookupEntity(email, role);
        case Task.CREATE_ENTITY:
          const { entity_name, description } = parameters;
          var entity = { entity_name, description } as Entity;
          return await createEntity(entity, { sub:callerSub, role:Roles.RE_ADMIN } as User);
        case Task.UPDATE_ENTITY:
          return updateEntity(parameters);
        case Task.DEACTIVATE_ENTITY:
          return await deactivateEntity(parameters);
        case Task.INVITE_USER:
          var { email, entity_id, role, registrationUri } = parameters;
          var user = { email, entity_id, role } as User;
          return await inviteUser(user, Roles.RE_ADMIN, async (entity_id:string, role?:Role) => {
            return await new SignupLink().getRegistrationLink({ entity_id, registrationUri });
          }, callerSub);
        case Task.INVITE_USERS:
          return await inviteUsers(parameters, callerSub);
        case Task.RETRACT_INVITATION:
          return await retractInvitation(parameters.code);
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
 * @param email 
 * @param role 
 * @returns 
 */
export const lookupEntity = async (email:string, role:Role):Promise<LambdaProxyIntegrationResponse> => {

  const userinfo = [ ] as any[];
  let totalUserCount = 0;

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
    users = users.filter(user => user.active == YN.Yes);
    totalUserCount = users.length; 
    users = users.filter(user => user.email != email);
    return users;
  }

  // Should return the entity details.
  const getEntity = async (entity_id:string):Promise<Entity|null> => {
    const dao = DAOFactory.getInstance({ DAOType:'entity', Payload: { entity_id }});
    return await dao.read() as Entity;
  }

  // Should return all pending invitations
  const pendingInvitationCache = {} as any;
  const getPendingInvitations = async (entity_id:string):Promise<Invitation[]> => {
    if(pendingInvitationCache[entity_id]) {
      return pendingInvitationCache[entity_id];
    }
    let invitations = await InvitationCrud({ entity_id } as Invitation).read() ?? [];
    if( ! (invitations instanceof Array)) {
      invitations = [ invitations ];
    }
    pendingInvitationCache[entity_id] = invitations.filter(invitation => {
      // Pending invitations will be those that have not had their emails set yet.
      return invitation.email == invitation.code;
    });
    return pendingInvitationCache[entity_id];
  }
  

  // 1) Get the user specified by the email. Almost never will this return more than
  // one entry, unless this user is a rep at more than one entity - should be RARE!
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
    usr.entity.pendingInvitations = await getPendingInvitations(usr.entity.entity_id);
    usr.entity.totalUserCount = totalUserCount;
    userinfo.push(usr);
  }

  // 3) Consolidate the information, and return it in the response payload
  let user = {};
  if(userinfo.length == 1) user = userinfo[0];
  if(userinfo.length > 1) user = userinfo;
  return okResponse('Ok', { user });
}

/**
 * Create a single entity. This function would only be used if creation of the entity is NOT part of registration and is
 * taking place AFTER the readmin has registered, created their account (but not the entity), and performing this action
 * as a separate task once signed in.
 * @param entity 
 * @param reAdmin 
 * @returns 
 */
export const createEntity = async (entity:Entity, reAdmin?:User):Promise<LambdaProxyIntegrationResponse> => {

  if( ! entity.entity_name) {
    return invalidResponse('Cannot proceed with unspecified entity');
  }

  if( ! entity.description) {
    entity.description = entity.entity_name;
  }

  if( ! entity.active) {
    entity.active = YN.Yes;
  }

  // Create the entity
  const daoEntity = DAOFactory.getInstance({ 
    DAOType: 'entity', 
    Payload: entity
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

      await migrateReAdminUserFromWaitingRoomToNewEntity(creatorEmail, new_entity_id);
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
export const updateReAdminInvitationWithNewEntity = async (reAdminEmail:string, new_entity_id:string) => {
  // Get the "homeless" invitation for the RE_ADMIN. This will be found by email hanging out in the waiting room.
  // There may be more than one if a SYS_ADMIN invited the RE_ADMIN again before the original invitation is accepted.
  log(`updateReAdminInvitationWithNewEntity: reAdminEmail:${reAdminEmail}, new_entity_id:${new_entity_id}`);
  let daoInvitation = DAOFactory.getInstance({ 
    DAOType: 'invitation', 
    Payload: { email:reAdminEmail, entity_id:ENTITY_WAITING_ROOM } as Invitation
  });
  const homelessInvitations = await daoInvitation.read() as Invitation[];
  if(homelessInvitations.length == 0) {
    console.error(`Invalid state: RE_ADMIN ${reAdminEmail} has no invitation record`);
  }

  // Apply the new entity id to the invitation(s) for the RE_ADMIN
  for(let i=0; i<homelessInvitations.length; i++) {
    daoInvitation = DAOFactory.getInstance({ 
      DAOType:'invitation', 
      Payload: { code: homelessInvitations[i].code, entity_id:new_entity_id } as Invitation
    });
    await daoInvitation.update();
  }
}

/**
 * Update the user record of an "entityless" RE_ADMIN so that it reflects a new entity.
 * @param reAdminEmail 
 * @param new_entity_id 
 */
const migrateReAdminUserFromWaitingRoomToNewEntity = async (reAdminEmail:string, new_entity_id:string) => {
  log(`updateReAdminUserRecordWithNewEntity: reAdminEmail:${reAdminEmail}, new_entity_id:${new_entity_id}`);
  const daoUser = DAOFactory.getInstance({
    DAOType: 'user',
    Payload: { email:reAdminEmail, entity_id:new_entity_id } as User
  }) as DAOUser;
  await daoUser.migrate(ENTITY_WAITING_ROOM);
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
export const inviteUser = async (user:User, inviterRole:Role, linkGenerator:Function, inviterCognitoUserName?:string): Promise<LambdaProxyIntegrationResponse> => {
  let { email, entity_id, role } = user;
  const cloudfrontDomain = process.env.CLOUDFRONT_DOMAIN;
  if(cloudfrontDomain) {

    let entity:Entity|null = null;
    const invitedByReAdmin = () => inviterRole == Roles.RE_ADMIN;
    const invitedToWaitingRoom = () => entity_id == ENTITY_WAITING_ROOM;
    const invitingAuthInd = () => role == Roles.RE_AUTH_IND
    const lookupInviterViaCognito = async (_role:Role): Promise<User[]> => {
      let matches = [] as User[];
      if(inviterCognitoUserName) {
        const inviterEmail = await lookupEmail(
          process.env.USERPOOL_ID || '', 
          inviterCognitoUserName, 
          process.env.REGION || ''
        );
        if(inviterEmail) {
          matches = (await lookupUser(inviterEmail)).filter((user) => {
            return user.role == _role && user.active == YN.Yes;
          });
        }
      }
      return matches;
    }

    // Prevent RE_ADMIN from inviting any other role than AUTH_IND
    if(invitedByReAdmin() && ! invitingAuthInd()) {
      return invalidResponse(`An ${Roles.RE_ADMIN} can only invite a ${Roles.RE_AUTH_IND}`);
    }

    // Prevent RE_ADMIN from inviting anyone to the waiting room (only SYS_ADMIN can do that).
    if(invitedByReAdmin() && invitedToWaitingRoom()) {
      return invalidResponse(`An ${Roles.RE_ADMIN} cannot invite anyone into the waiting room`);
    }

    // Attempt to lookup the entity
    if(entity_id && ! invitedToWaitingRoom()) {
      entity = await lookupSingleActiveEntity(entity_id) as Entity;
      if( ! entity) {
        return invalidResponse(`Entity ${entity_id} lookup failed`);
      }
    }

    // Lookup the inviter.
    let inviterLookupMatches = [] as User[];
    if(invitedByReAdmin()) {
      inviterLookupMatches = await lookupInviterViaCognito(Roles.RE_ADMIN);
      if(inviterLookupMatches.length == 0 && ! entity_id) {
        return invalidResponse(`Lookup for ${Roles.RE_ADMIN} inviter failed`);
      }
      if(inviterLookupMatches.length == 1 && ! entity_id) {
        entity_id = inviterLookupMatches[0].entity_id;
      }
    }

    // Prevent an RE_ADMIN from inviting someone to an entity they are not themselves a member of.
    if(invitedByReAdmin() && inviterLookupMatches.length > 0 && entity_id) {
      if( ! inviterLookupMatches.some(m => m.entity_id == entity_id)) {
        return invalidResponse(`The ${Roles.RE_ADMIN} cannot invite anyone to entity: ${entity_id} if they are not a member themselves.`);
      }
    }

    // Bail out if the entity is undetermined and the RE_ADMIN inviter belongs to more than one entity.
    if(invitedByReAdmin() && inviterLookupMatches.length > 1 && ! entity_id) {
      const msg = `The inviter appears to be a ${Roles.RE_ADMIN} for multiple entities`;
      const listing = (inviterLookupMatches).reduce((list:string, _user:User) => {
        return `${list}, ${_user.entity_id}`
      }, '');
      return invalidResponse(`${msg}: ${listing} - it is not clear to which the invitation applies.`);
    }

    // Bail out at this point if the entity is still undetermined and the inviter is a RE_ADMIN
    if(invitedByReAdmin() && ! entity_id ) {
      return invalidResponse(`Cannot determine entity to invite ${email} to.`);
    }

    // Default the entity as the waiting room.
    if( ! entity_id) {
      entity_id = ENTITY_WAITING_ROOM
      entity = { entity_id, active: YN.Yes, entity_name:entity_id } as Entity
    }

    // Prevent inviting the user if they already have an account with the specified entity.
    const user = await lookupSingleUser(email, entity_id);
    if(user && user.active == YN.Yes) {
      return invalidResponse(`Invitee ${email} has already accepted invitation for entity ${entity_id}`);
    }

    // Prevent inviting a non-RE_AUTH_IND user if somebody has already been invited for the same role in the same entity.
    const pendingInvitations = await lookupPendingInvitations(entity_id) as Invitation[];
    log(`Checking existing/prior invitations for ${role} to ${entity_id} for conflicts...`);
    const conflictingInvitations = pendingInvitations.filter((invitation) => {
      if(invitation.retracted_timestamp) return false;
      if(invitedToWaitingRoom()) return false; // Anybody can be invited into the waiting room.
      if(invitation.role == Roles.RE_AUTH_IND) return false; // You can invite any number of AUTH_IND users to an entity (despite config limit).

      const { registered_timestamp, retracted_timestamp, sent_timestamp, email:invEmail, role } = invitation;
      const sent = sent_timestamp ? new Date(sent_timestamp).getTime() : 0;
      const registered = registered_timestamp ? new Date(registered_timestamp).getTime() : 0;
      const retracted = retracted_timestamp ? new Date(retracted_timestamp).getTime() : 0;

      if(retracted > sent) {
        log(`${invEmail} is NOT invited as ${role} because the their invitation was retracted after 
          it was last sent. Thus they are re-invitable to register`);
        return false; 
      }

      if(sent > registered) {
        // The user has not registered with this invitation yet, So, Figure out if the invitation has expired.
        const mils = Date.now() - sent;
        const configs = new Configurations();
        let expireAfterMils = 0;
        (async () => {
          expireAfterMils = (await configs.getAppConfig(ConfigNames.ASP_INVITATION_EXPIRE_AFTER)).getDuration() * 1000;
        })();
        if(mils >= expireAfterMils) {
          log(`${invEmail} was invited to register as ${role}, but that invitation expired. Thus they are re-invitatable`);
          return false;
        }
      }

      let deactivated = true;
      (async () => {
        const invitedUser = await lookupSingleUser(invEmail, entity_id);
        if( ! invitedUser || ! invitedUser.active || invitedUser.active == YN.No) {
          log(`${invEmail} has used non-retracted invitation to register as ${role}, 
            but has since been deactivated. Thus they are re-invitable (to re-register)`);
          return;
        }
        deactivated = false;
      })();

      if(deactivated) {
        return false; // Another user was invited for the same role in the same entity, but they are not active, exclude them as conflicting.
      }

      return true; // // Another currently active user was invited for the same role in the same entity, thus conflicting.
    });

    if(conflictingInvitations.length > 0) {
      return invalidResponse(`One or more individuals already have outstanding invitations for role: ${role} in entity: ${entity_id}`);
    }

    const link = await linkGenerator(entity_id, role);

    // Instantiate an invitation
    const emailInvite = new UserInvitation(
      { entity_id, email, role } as Invitation, 
      link, 
      entity?.entity_name || ENTITY_WAITING_ROOM);
    
    // Send the invitation
    if( await emailInvite.send()) {
      const msg = `Invitation successfully sent: ${emailInvite.code}`
      return okResponse(msg, { invitation_code: emailInvite.code, invitation_link: emailInvite.link });
    }
    else {
      const msg = `Invitation failure: ${emailInvite.code}`;
      return errorResponse(msg);
    } 
  }
  else {
    return errorResponse(`Unable to determine the url for ${role} signup`);
  }
}

const getInvitedUsersValidationResult = (parameters:any, callerSub?:string):LambdaProxyIntegrationResponse|null => {
  const { entity, invitations } = parameters;
  const { entity_name } = (entity ?? {}) as Entity;
  const { email:email1, role:role1 } = invitations?.invitee1 || {};
  let { email:email2='', role:role2 } = invitations?.invitee2 || {};
  if( ! email1 || ! role1) {
    return invalidResponse(`Cannot create entity ${entity_name} since invitee1 is missing/incomplete`);
  }

  if( (email1 as string).toLowerCase() == (email2 as string).toLowerCase()) {
    return invalidResponse(`Cannot invite two authorized individuals with the same email: ${email1}`);
  }

  return null;
}

/**
 * Invite both authorized individuals. The entity has already been created.
 * @param parameters 
 * @param callerSub 
 * @returns 
 */
export const inviteUsers = async (parameters:any, callerSub?:string):Promise<LambdaProxyIntegrationResponse> =>  {
  const { entity, invitations, registrationUri } = parameters;
  const { entity_id } = (entity ?? {}) as Entity;
  const { email:email0, role:role0 } = invitations?.inviter || {};
  const { email:email1, role:role1 } = invitations?.invitee1 || {};
  const { email:email2, role:role2 } = invitations?.invitee2 || {};

  const result = getInvitedUsersValidationResult(parameters, callerSub);
  if(result?.statusCode == 400) return result;

  const inviter = { email:email0, role:role0, entity_id } as User;
  const invitee1 = { email:email1, role:role1, entity_id } as User;
  const responses = [] as LambdaProxyIntegrationResponse[];

  const response1 = await inviteUser(invitee1, Roles.RE_ADMIN, async (entity_id:string, role?:Role) => {
    return await new SignupLink().getRegistrationLink({ entity_id, registrationUri });
  }, callerSub);
  responses.push(response1);

  if( email2 && role2) {
    const invitee2 = { email:email2, role:role2, entity_id } as User;
    const response2 = await inviteUser(invitee2, Roles.RE_ADMIN, async (entity_id:string, role?:Role) => {
      return await new SignupLink().getRegistrationLink({ entity_id, registrationUri });
    }, callerSub);
    responses.push(response2);
  }

  const invalidResponse = responses.find(response => ! isOk(response));

  let response = await lookupEntity(inviter.email, inviter.role);
  responses.push(response);

  // Bundle the invalid responses into the overall response if there are any.
  if(invalidResponse) {
    response = mergeResponses(responses);
  }

  return response;
}


/**
 * Retract an invitation by deleting it from the database.
 * @param code 
 * @returns 
 */
export const retractInvitation = async (code:string):Promise<LambdaProxyIntegrationResponse> => {
  await UserInvitation.retractInvitation(code);
  return okResponse('Ok');
}



/**
 * RUN MANUALLY: Modify the task, landscape, email, role, & entity_id as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/re-admin/ReAdminUser.ts')) {

  const task = Task.INVITE_USERS as Task;
  const { DisclosureRequestReminder, HandleStaleEntityVacancy } = DelayedExecutions;

  (async () => {
    // 1) Get context variables
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, ACCOUNT, REGION, TAGS: { Landscape }} = context;
    const prefix = `${STACK_ID}-${Landscape}`;

    // 2) Get the cloudfront domain
    const cloudfrontDomain = await lookupCloudfrontDomain(Landscape);
    if( ! cloudfrontDomain) {
      throw('Cloudfront domain lookup failure');
    }

    // 3) Get the userpool ID
    const userpoolId = await lookupUserPoolId(`${prefix}-cognito-userpool`, REGION);

    // 4) Get bucket name & lambda function arns
    const bucketName = `${prefix}-exhibit-forms`;
    const discFuncName = `${prefix}-${DisclosureRequestReminder.coreName}`;
    const staleFuncName = `${prefix}-${HandleStaleEntityVacancy.coreName}`;

    // 5) Set environment variables (many are used if the RE_ADMIN is doing work on behalf of an AI)
    process.env[DisclosureRequestReminder.targetArnEnvVarName] = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${discFuncName}`;
    process.env[HandleStaleEntityVacancy.targetArnEnvVarName] = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${staleFuncName}`;
    process.env[ExhibitFormsBucketEnvironmentVariableName] = bucketName;
    process.env.PREFIX = prefix
    process.env.CLOUDFRONT_DOMAIN = cloudfrontDomain;
    process.env.USERPOOL_ID = userpoolId;
    process.env.REGION = REGION;

    let payload = {};
    let _event = {};

    switch(task) {
      case Task.LOOKUP_USER_CONTEXT:
      case Task.INVITE_USER:
        payload = {
          task,
          parameters: {
            email: 'asp1.random.edu@warhen.work',
            role: Roles.RE_ADMIN,
          }
        } as IncomingPayload;
        _event = {
          headers: {
            [AbstractRoleApi.ETTPayloadHeader]: JSON.stringify(payload)
          },
          requestContext: {
            authorizer: {
              claims: {
                username: '417bd590-f021-70f6-151f-310c0a83985c',
                sub: '417bd590-f021-70f6-151f-310c0a83985c'
              }
            }
          }
        } as any;
        break;
      case Task.INVITE_USERS: // entity will be ignored if included
        payload = {
          task,
          parameters: {
            entity: {
              name: 'Somewhere State University'
            },
            invitations: {
              inviter: {
                email: 'asp1.ssu.edu@warhen.work',
                role: Roles.RE_ADMIN
              },
              invitee1: {
                email: 'auth1.ssu.edu@warhen.work',
                role: Roles.RE_AUTH_IND
              },
              invitee2: {
                email: 'auth2.ssu.edu@warhen.work',
                role: Roles.RE_AUTH_IND
              }
            }
          }
        } as IncomingPayload;
        _event = {
          headers: {
            [AbstractRoleApi.ETTPayloadHeader]: JSON.stringify(payload)
          },
          requestContext: {
            authorizer: {
              claims: {
                username: '718b15f0-7011-7001-2c69-41dda37a90ee',
                sub: '718b15f0-7011-7001-2c69-41dda37a90ee'
              }
            }
          }
        } as any;
        break;
    }

    const response:LambdaProxyIntegrationResponse = await handler(_event);
    log(response);

  })(); 
}