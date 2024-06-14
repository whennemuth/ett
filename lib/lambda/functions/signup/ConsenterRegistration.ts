import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { ConsenterCrud } from "../../_lib/dao/dao-consenter";
import { Consenter, YN } from "../../_lib/dao/entity";
import { debugLog, errorResponse, invalidResponse, log, okResponse } from "../Utils";

/**
 * Handles the public steps of registration for consenting individual
 * @param event 
 * @returns 
 */
export const handler = async(event:any):Promise<LambdaProxyIntegrationResponse> => {

  try {
    debugLog(event);
    
    const payloadJson = event.headers[AbstractRoleApi.ETTPayloadHeader];
    const payload = payloadJson ? JSON.parse(payloadJson) as IncomingPayload : null;
    const { parameters } = payload ?? {};
    
    if( ! parameters) {
      return invalidResponse(`Bad Request: Missing parameters parameter for consenter registration`);
    }

    const { email, firstname, middlename, lastname } = parameters;

    if( ! email) {
      return invalidResponse('Bad Request: Missing email parameter');
    }

    if( ! firstname) {
      return invalidResponse('Bad Request: Missing firstname parameter');
    }

    if( ! lastname) {
      return invalidResponse('Bad Request: Missing lastname parameter');
    }

    log(`Registering ${email}`);
  
    // Create the consenter in the database via an update (in case registration was interrupted and is being retried)
    const create_timestamp = new Date().toISOString();
    const active = YN.Yes
    let dao = ConsenterCrud({ email, firstname, middlename, lastname, create_timestamp, active } as Consenter);
    await dao.update();
  
    return okResponse(`${email} created`);
  }
  catch(e:any) {
    console.log(e);
    return errorResponse(e.message);
  }
}

