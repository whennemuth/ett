import { DynamoDbConstruct } from '../../../DynamoDb';
import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from '../../../role/AbstractRole';
import { Configurations } from '../../_lib/config/Config';
import { DAOEntity, DAOFactory } from '../../_lib/dao/dao';
import { ENTITY_WAITING_ROOM } from '../../_lib/dao/dao-entity';
import { Config, ConfigNames, Entity, EntityFields, Role, Roles, YN } from '../../_lib/dao/entity';
import { SignupLink } from '../../_lib/invitation/SignupLink';
import { debugLog, errorResponse, invalidResponse, log, lookupCloudfrontDomain, okResponse } from "../../Utils";
import { Task as ReAdminTasks, createEntity, createEntityAndInviteUsers, deactivateEntity, inviteUser, inviteUsers, lookupEntity, updateEntity } from '../re-admin/ReAdminUser';
import { DynamoDbTableOutput } from './DynamoDbTableOutput';
import { HtmlTableView } from './view/HtmlTableView';

export enum Task {
  REPLACE_RE_ADMIN = 'replace-re-admin',
  GET_DB_TABLE = 'get-db-table',
  GET_APP_CONFIGS = 'get-app-configs',
  GET_APP_CONFIG = 'get-app-config',
  SET_APP_CONFIG = 'set-app-config'
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
        case ReAdminTasks.INVITE_USERS:
          return await inviteUsers(parameters);
        case ReAdminTasks.CREATE_ENTITY_INVITE:
          return await createEntityAndInviteUsers(parameters);
        case ReAdminTasks.PING:
          return okResponse('Ping!', parameters);
        case Task.REPLACE_RE_ADMIN:
          return await replaceAdmin(parameters);
        case Task.GET_DB_TABLE:
          return await getDbTable(parameters);
        case Task.GET_APP_CONFIGS:
          return await getAppConfigs();
        case Task.GET_APP_CONFIG:
          return await getAppConfig(parameters);
        case Task.SET_APP_CONFIG:
          return await setAppConfig(parameters);
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
 * Retrieve the contents of the specified database table in html form.
 * @param parms 
 * @returns 
 */
export const getDbTable = async (parms:any):Promise<LambdaProxyIntegrationResponse> => {
  let { tableName } = parms;
  if( ! tableName) {
    return invalidResponse('Table name parameter is missing: tableName');
  }

  console.log(`Getting database table: ${tableName}`);

  const tables:string[] = DynamoDbConstruct.getTableNames();

  const noSuchTableMsg = `Bad Request - No matching table for: ${tableName}`;
  // Find a table that is equal to or ends with the provided value.
  tableName = tables.find(tb => tb == tableName || tb.endsWith(tableName));

  if( ! tableName) {
    return invalidResponse(noSuchTableMsg);
  }

  const html = await new DynamoDbTableOutput(
    new HtmlTableView()
  ).getDisplay(tableName);

  return okResponse('Ok', { html });
};

/**
 * @returns The full set of application configurations.
 */
export const getAppConfigs = async ():Promise<LambdaProxyIntegrationResponse> => {
  const configs = await new Configurations().getAppConfigs();
  return okResponse('Ok', { configs });
}

/**
 * @param parms 
 * @returns A single application configuration.
 */
export const getAppConfig = async (parms:any):Promise<LambdaProxyIntegrationResponse> => {
  const { name } = parms;
  const config = await new Configurations().getAppConfig(name);
  return okResponse('Ok', { config });
}

/**
 * Modify a single application configuration
 * @param parms 
 * @returns 
 */
export const setAppConfig = async (parms:any):Promise<LambdaProxyIntegrationResponse> => {
  const { name, value, description } = parms;
  if( ! name) {
    return invalidResponse('Bad Request: name parameter required');
  }
  if( ! Object.values<string>(ConfigNames).includes(name)) {
    return invalidResponse(`Bad Request - no such parameter: ${name}`);
  }
  if( ! value) {
    return invalidResponse('Bad Request: value parameter required');
  }
  let config = { name, value } as Config;
  if(description) {
    config.description = description;
  }
  await new Configurations().setDbConfig(config);
  return okResponse('Ok');
}


/**
 * RUN MANUALLY: Modify the task, landscape, email & role as needed.
 */
const { argv:args } = process;
if(args.length > 3 && args[2] == 'RUN_MANUALLY_SYS_ADMIN') {

  const task = ReAdminTasks.INVITE_USER;
  const email = args[3];
  const landscape = args[4];
  
  process.env.USERPOOL_NAME = 'ett-dev-cognito-userpool'; 
  process.env.COGNITO_DOMAIN = 'ett-dev.auth.us-east-2.amazoncognito.com'; //  `${this.context.STACK_ID}-${this.context.TAGS.Landscape}.${REGION}.amazoncognito.com`
  process.env.REGION = 'us-east-2';
  process.env.DEBUG = 'true';

  const daoEntityRead = DAOFactory.getInstance({ 
    DAOType: 'entity',
    Payload: { [EntityFields.entity_id]: ENTITY_WAITING_ROOM }
  }) as DAOEntity;

  daoEntityRead.read()
  .then((entity:(Entity|null)|Entity[]) => {
    if(entity) {
      return new Promise((resolve, reject) => {
        console.log(`${ENTITY_WAITING_ROOM} already exists`);
        resolve(entity);
      })
    }
    else {
      const daoEntityCreate = DAOFactory.getInstance({ 
        DAOType: 'entity', 
        Payload: { 
          [EntityFields.entity_id]: ENTITY_WAITING_ROOM, 
          [EntityFields.entity_name]: ENTITY_WAITING_ROOM, 
          [EntityFields.description]: 'The "waiting room", a pseudo-entity for new users not associated yet with a real entity.',
          [EntityFields.active]: YN.Yes,
        }
      }) as DAOEntity;
      return daoEntityCreate.create();
    }
  })
  .then((entity:Entity) => {
    return lookupCloudfrontDomain(landscape) as Promise<string>;
  })  
  .then((cloudfrontDomain:string) => {
    if( ! cloudfrontDomain) {
      throw('Cloudfront domain lookup failure');
    }
    process.env.CLOUDFRONT_DOMAIN = cloudfrontDomain;
    process.env.REDIRECT_URI = `${cloudfrontDomain}/index.htm`;

    const payload = {
      task,
      parameters: {
        email,
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