import { IContext } from '../../../../contexts/IContext';
import { DelayedExecutions } from '../../../DelayedExecution';
import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from '../../../role/AbstractRole';
import { lookupEmail, lookupUserPoolId } from '../../_lib/cognito/Lookup';
import { DAOEntity, DAOFactory, DAOUser } from '../../_lib/dao/dao';
import { ENTITY_WAITING_ROOM } from '../../_lib/dao/dao-entity';
import { Entity, Invitation, Role, roleFullName, Roles, User, UserFields, YN } from '../../_lib/dao/entity';
import { InvitablePerson, InvitablePersonParms } from '../../_lib/invitation/InvitablePerson';
import { UserInvitation } from '../../_lib/invitation/Invitation';
import { SignupLink } from '../../_lib/invitation/SignupLink';
import { debugLog, errorResponse, invalidResponse, isOk, log, lookupCloudfrontDomain, lookupPendingInvitations, mergeResponses, okResponse } from "../../Utils";
import { ExhibitFormsBucketEnvironmentVariableName } from '../consenting-person/BucketItemMetadata';
import { EntityRegistrationEmail } from './RegistrationEmail';

export enum Task {
  CREATE_ENTITY = 'create-entity',
  UPDATE_ENTITY = 'update-entity',
  DEACTIVATE_ENTITY = 'deactivate-entity',
  LOOKUP_USER_CONTEXT = 'lookup-user-context',
  INVITE_USERS = 'invite-users',
  INVITE_USER = 'invite-user',
  RETRACT_INVITATION = 'retract-invitation',
  SEND_REGISTRATION = 'send-registration',
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
          return await inviteASingleUser(parameters, callerSub);
        case Task.INVITE_USERS:
          return await inviteUsers(parameters, callerSub);
        case Task.RETRACT_INVITATION:
          return await retractInvitation(parameters.code);
        case Task.SEND_REGISTRATION:
          var { email, role, termsHref, loginHref } = parameters;
          return await sendEntityRegistrationForm({ email, role, termsHref, loginHref });
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

export type EntityInfo = Entity & { users:User[], pendingInvitations:Invitation[], totalUserCount:number };
export type UserInfo = User & { entity:EntityInfo };
/**
 * Get the users information, including the entity details, as well as the other users in the entity.
 * @param email 
 * @param role 
 * @returns 
 */
export const _lookupEntity = async (email:string, role:Role):Promise<UserInfo> => {
  email = email.toLowerCase();
  const userinfo = [ ] as UserInfo[];
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
    let invitations = await lookupPendingInvitations(entity_id) as Invitation[];
    pendingInvitationCache[entity_id] = invitations;
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
  return user as UserInfo;
}

/**
 * Get the users information, including the entity details, as well as the other users in the entity.
 * @param email 
 * @param role 
 * @returns 
 */
export const lookupEntity = async (email:string, role:Role):Promise<LambdaProxyIntegrationResponse> => {
  const userInfo = await _lookupEntity(email, role) as UserInfo;
  return okResponse('Ok', { user: userInfo });
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

const getInvitedUsersValidationResult = (parameters:any, callerSub?:string):LambdaProxyIntegrationResponse|null => {
  const { entity, invitations } = parameters;
  const { entity_name } = (entity ?? {}) as Entity;
  const { email:email1, role:role1 } = invitations?.invitee1 || {};
  let { email:email2='', role:role2 } = invitations?.invitee2 || {};
  if( ! email1 || ! role1) {
    return invalidResponse(`Cannot create entity ${entity_name} since invitee1 is missing/incomplete`);
  }

  if( (email1 as string).toLowerCase() == (email2 as string).toLowerCase()) {
    return invalidResponse(`Cannot invite two ${roleFullName(Roles.RE_AUTH_IND)}s with the same email: ${email1}`);
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

  const invitablePerson1 = new InvitablePerson({ invitee:invitee1, inviterRole:Roles.RE_ADMIN, linkGenerator:
    async (entity_id:string, role?:Role) => {
      return await new SignupLink().getRegistrationLink({ email:email1, entity_id, registrationUri });
    }, inviterCognitoUserName:callerSub
  } as InvitablePersonParms);
  const response1 = await invitablePerson1.invite();

  responses.push(response1);

  if( email2 && role2) {
    const invitee2 = { email:email2, role:role2, entity_id } as User;
    const invitablePerson2 = new InvitablePerson({ invitee:invitee2, inviterRole:Roles.RE_ADMIN, linkGenerator:
      async (entity_id:string, role?:Role) => {
        return await new SignupLink().getRegistrationLink({ email:email2, entity_id, registrationUri });
      }, inviterCognitoUserName:callerSub
    } as InvitablePersonParms);
    const response2 = await invitablePerson2.invite();
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

export const inviteASingleUser = async (parameters:any, callerSub:string):Promise<LambdaProxyIntegrationResponse> => {
  const { email, entity_id, role, registrationUri } = parameters;
  const user = { email, entity_id, role } as User;
  const invitablePerson = new InvitablePerson({ invitee:user, inviterRole:Roles.RE_ADMIN, 
    linkGenerator: async (entity_id:string, role?:Role) => {
      return await new SignupLink().getRegistrationLink({ email, entity_id, registrationUri });
    }, inviterCognitoUserName:callerSub
  } as InvitablePersonParms);
  return await invitablePerson.invite();
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

export type SendEntityRegistrationFormData = {
  email:string,
  role:Role,
  termsHref?:string,
  loginHref?:string,
  meetsPrequisite?:(userInfo:UserInfo) => boolean
}

/**
 * Send an email to the user by their request a copy of their registration form.
 * @param email 
 * @param role 
 * @param loginHref Contains the url that the pdf file includes for directions to the ETT website.
 * @returns 
 */
export const sendEntityRegistrationForm = async (data:SendEntityRegistrationFormData):Promise<LambdaProxyIntegrationResponse> => {
  const { email, role, termsHref, loginHref, meetsPrequisite } = data;
  log({ email, role, termsHref, loginHref }, 'sendEntityRegistrationForm');
  const response = await lookupEntity(email, role) as LambdaProxyIntegrationResponse;
  if( ! isOk(response)) {
    log('Failed to lookup entity info');
    return response;
  }
  if( ! response.body) {
    log('No entity found');
    return invalidResponse(`No entity found for ${email}`);
  }
  const userInfo = await _lookupEntity(email, role) as UserInfo;
  if(meetsPrequisite && ! meetsPrequisite(userInfo)) {
    log('Prerequisites NOT met for sending registration form');
    return okResponse('Ok');
  }
  const regEmail = new EntityRegistrationEmail({ ...userInfo, termsHref, loginHref });

  await regEmail.send();

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