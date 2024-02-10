import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from '../../../role/AbstractRole';
import { Roles } from '../../_lib/dao/entity';
import { debugLog, errorResponse, invalidResponse, log, okResponse } from "../Utils";
import { Task as ReAdminTasks, createEntity, deactivateEntity, inviteUser, updateEntity } from '../re-admin/ReAdminUser';

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
        case ReAdminTasks.CREATE_ENTITY:
          return await createEntity(parameters);
        case ReAdminTasks.UPDATE_ENTITY:
          return updateEntity(parameters);
        case ReAdminTasks.DEACTIVATE_ENTITY:
          return await deactivateEntity(parameters);
        case ReAdminTasks.INVITE_USER:
          return await inviteUser(parameters, Roles.SYS_ADMIN);
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
