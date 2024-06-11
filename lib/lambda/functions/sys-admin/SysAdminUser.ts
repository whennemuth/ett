import { DynamoDbConstruct } from '../../../DynamoDb';
import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from '../../../role/AbstractRole';
import { Role, Roles } from '../../_lib/dao/entity';
import { SignupLink } from '../../_lib/invitation/SignupLink';
import { debugLog, errorResponse, invalidResponse, log, lookupCloudfrontDomain, okResponse } from "../Utils";
import { Task as ReAdminTasks, lookupEntity, createEntity, deactivateEntity, inviteUser, updateEntity, createEntityAndInviteUsers } from '../re-admin/ReAdminUser';

export enum Task {
  REPLACE_RE_ADMIN = 'replace_re_admin'
}

/**
 * This function performs all actions a system administrator can take. This includes anything an RE_ADMIN
 * can do, except that an RE_ADMIN can only invite RE_AUTH_IND roles to the same entity, whereas a SYS_ADMIN
 * can invite any user regardless of entity_id or entity even existing. 
 * @param event 
 * @returns 
 */
export const handler = async (event:any):Promise<LambdaProxyIntegrationResponse> => {
  try {

    debugLog(event);
  
    const payloadJson = event.headers[AbstractRoleApi.ETTPayloadHeader];
    const payload = payloadJson ? JSON.parse(payloadJson) as IncomingPayload : null;
    let { task, parameters } = payload || {};

    const unknownTask = (task?:string):boolean => {
      if(Object.values<string>(ReAdminTasks).includes(task || '')) return false;
      if(Object.values<string>(Task).includes(task || '')) return false;
      return true;
    }

    if(unknownTask(task)) {
      return invalidResponse(`Invalid/Missing task parameter: ${task}`);
    }
    else if( ! parameters) {
      return invalidResponse(`Missing parameters parameter for ${task}`);
    }
    else {
      log(`Performing task: ${task}`);
      switch(task as ReAdminTasks|Task) {
        case ReAdminTasks.LOOKUP_USER_CONTEXT:
          const { email, role } = parameters;
          return await lookupEntity(email, role);
        case ReAdminTasks.CREATE_ENTITY:
          return await createEntity(parameters);
        case ReAdminTasks.UPDATE_ENTITY:
          return updateEntity(parameters);
        case ReAdminTasks.DEACTIVATE_ENTITY:
          return await deactivateEntity(parameters);
        case ReAdminTasks.INVITE_USER:
          return await inviteUser(parameters, Roles.SYS_ADMIN, async (entity_id:string, role:Role) => {
            if(role == Roles.SYS_ADMIN) {
              return await new SignupLink().getCognitoLinkForRole(role);
            }
            return await new SignupLink().getRegistrationLink(entity_id);
          });
        case ReAdminTasks.CREATE_ENTITY_INVITE:
          return await createEntityAndInviteUsers(parameters);
        case ReAdminTasks.PING:
          return okResponse('Ping!', parameters);
        case Task.REPLACE_RE_ADMIN:
          return await replaceAdmin(parameters);
      } 
    }
  }
  catch(e:any) {
    return errorResponse(`Internal server error: ${e.message}`);
  }
}

/**
 * Replace the RE_ADMIN for the entity with somebody else (may involve deactivating the current RE_ADMIN and inviting a different email)
 * @param parms 
 */
export const replaceAdmin = async (parms:any):Promise<LambdaProxyIntegrationResponse> => {
  console.log('Not implemented yet.');
  return errorResponse('Not implemented yet');
}


/**
 * RUN MANUALLY: Modify the task, landscape, email & role as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_SYS_ADMIN') {

  const task = ReAdminTasks.INVITE_USER;
  const email = args[3];
  const landscape = args[4];
  process.env.DYNAMODB_INVITATION_TABLE_NAME = DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME;
  process.env.DYNAMODB_USER_TABLE_NAME = DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME;
  process.env.DYNAMODB_ENTITY_TABLE_NAME = DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME;
  process.env.DYNAMODB_INVITATION_ENTITY_INDEX = DynamoDbConstruct.DYNAMODB_INVITATION_ENTITY_INDEX;
  process.env.DYNAMODB_INVITATION_EMAIL_INDEX = DynamoDbConstruct.DYNAMODB_INVITATION_EMAIL_INDEX;
  process.env.DYNAMODB_CONSENTER_TABLE_NAME = DynamoDbConstruct.DYNAMODB_CONSENTER_TABLE_NAME;
  process.env.USERPOOL_NAME = 'ett-cognito-userpool'; 
  process.env.COGNITO_DOMAIN = 'ett-dev.auth.us-east-2.amazoncognito.com'; //  `${this.context.STACK_ID}-${this.context.TAGS.Landscape}.${REGION}.amazoncognito.com`
  process.env.REGION = 'us-east-2';
  process.env.DEBUG = 'true';

  lookupCloudfrontDomain(landscape).then((cloudfrontDomain) => {
    if( ! cloudfrontDomain) {
      throw('Cloudfront domain lookup failure');
    }
    process.env.CLOUDFRONT_DOMAIN = cloudfrontDomain;
    process.env.REDIRECT_URI = `${cloudfrontDomain}/index.htm`;

    const payload = {
      task,
      parameters: {
        email: 'wrh@bu.edu',
        role: Roles.SYS_ADMIN
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