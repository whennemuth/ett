import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { lookupUserPoolId } from "../../_lib/cognito/Lookup";
import { debugLog, errorResponse, invalidResponse, log, lookupCloudfrontDomain, okResponse } from "../Utils";
import { DemolitionRecord, EntityToDemolish } from "./Demolition";

export enum Task {
  DEMOLISH_ENTITY = 'demolish-entity',
  PING = 'ping'
};

/**
 * This function performs all actions a RE_AUTH_IND can take to accomplish their role in the system.
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
      return invalidResponse(`Bad Request: Invalid/Missing task parameter: ${task}`);
    }
    else if( ! parameters) {
      return invalidResponse(`Bad Request: Missing parameters parameter for ${task}`);
    }
    else {
      log(`Performing task: ${task}`);
      const callerUsername = event?.requestContext?.authorizer?.claims?.username;
      const callerSub = callerUsername || event?.requestContext?.authorizer?.claims?.sub;
      switch(task as Task) {
        case Task.DEMOLISH_ENTITY:
          const { entity_id, dryRun=false } = parameters;

          // Bail out if missing the required entity_id parameter
          if( ! entity_id) {
            return invalidResponse('Bad Request: Missing entity_id parameter');
          }

          // Demolish the entity
          const entityToDemolish = new EntityToDemolish(entity_id);
          entityToDemolish.dryRun = dryRun;
          const demolitionRecord = await entityToDemolish.demolish() as DemolitionRecord;

          // Bail out if the initial lookup for the entity failed.
          if( ! entityToDemolish.entity) {
            return invalidResponse(`Bad Request: Invalid entity_id: ${entity_id}`);
          }
          return okResponse('Ok', demolitionRecord);
        case Task.PING:
          return okResponse('Ping!', parameters);
      } 

    }
  }
  catch(e:any) {
    console.error(e);
    return errorResponse(`Internal server error: ${e.message}`);
  }
}


/**
 * RUN MANUALLY: Modify the task, landscape, entity_id, and dryRun settings as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY') {

  const task = Task.DEMOLISH_ENTITY;
  const landscape = 'dev';
  const region = 'us-east-2';
  const dryRun = true;
  const entity_id = 'db542060-7de0-4c55-be58-adc92671d63a';

  lookupCloudfrontDomain(landscape).then((cloudfrontDomain) => {
    if( ! cloudfrontDomain) {
      throw('Cloudfront domain lookup failure');
    }
    process.env.CLOUDFRONT_DOMAIN = cloudfrontDomain;
    return lookupUserPoolId('ett-cognito-userpool', region);
  }).then((userpoolId) => {

    process.env.DYNAMODB_INVITATION_TABLE_NAME = 'ett-invitations';
    process.env.DYNAMODB_USER_TABLE_NAME = 'ett-users';
    process.env.DYNAMODB_ENTITY_TABLE_NAME = 'ett-entities'
    process.env.USERPOOL_ID = userpoolId;
    process.env.REGION = region;
    process.env.DEBUG = 'true';

    const payload = {
      task,
      parameters: {
        entity_id, dryRun
      }
    } as IncomingPayload;

    const _event = {
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
    } as any

    return handler(_event);
  }).then(() => {
    console.log(`${task} complete.`)
  })
  .catch((reason) => {
    console.error(reason);
  });
}