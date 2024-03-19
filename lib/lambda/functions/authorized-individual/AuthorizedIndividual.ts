import { SESv2Client, SendEmailCommand, SendEmailCommandInput, SendEmailResponse } from "@aws-sdk/client-sesv2";
import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { lookupUserPoolId } from "../../_lib/cognito/Lookup";
import { Entity, User } from "../../_lib/dao/entity";
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
          const { entity_id, dryRun=false, notify=true } = parameters;

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
          
          // For every user deleted by the demolish operation, notify them it happened by email.
          if(notify) {            
            const isEmail = (email:string|undefined) => /@/.test(email||'');
            entityToDemolish.deletedUsers
              .map((user:User) => { return isEmail(user.email) ? user.email : ''; })
              .filter((email:string) => email)
              .forEach(async (email:string) => {
                await notifyUserOfDemolition(email, entityToDemolish.entity);
              });
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
 * Send a single email to an address notifying the recipient about the entity being demolished.
 * @param emailAddress 
 * @returns 
 */
const notifyUserOfDemolition = async (emailAddress:string, entity:Entity):Promise<void> => {
  console.log(`Notifying ${emailAddress} that entity ${entity.entity_id}: ${entity.entity_name} was demolished`);

  const client = new SESv2Client({
    region: process.env.REGION
  });

  const command = new SendEmailCommand({
    Destination: {
      ToAddresses: [ emailAddress ],
    },
    FromEmailAddress: 'noreply@ett.com',
    Content: {
      Simple: {
        Subject: {
          Charset: 'utf-8',
          Data: 'NOTIFICATION: Ethical Transparency Tool (ETT) - notice of entity cancellation',
        },
        Body: {
          // Text: { Charset: 'utf-8', Data: 'This is a test' },
          Html: {
            Charset: 'utf-8',
            Data: `
              <style>
                div { float: initial; clear: both; padding: 20px; width: 500px; }
                hr { height: 1px; background-color: black; margin-bottom:20px; margin-top: 20px; border: 0px; }
                .content { max-width: 500px; margin: auto; }
                .heading1 { font: 16px Georgia, serif; background-color: #ffd780; text-align: center; }
                .body1 { font: italic 14px Georgia, serif; background-color: #ffe7b3; text-align: justify;}
              </style>
              <div class="content">
                <div class="heading1">Notice of entity cancellation</div>
                <div class="body1" style="padding:20px;">
                  <hr>
                  You have recently participated in an invitation to register with ${entity.entity_name} through the ETT (Ethical Transparency Tool).
                  <br>
                  However, an Authorized Individual has opted to cancel the registration process for this entity. 
                </div>
              </div>`
          }
        }
      }
    }
  } as SendEmailCommandInput);

  try {
    const response:SendEmailResponse = await client.send(command);
    const messageId = response?.MessageId;
    if( ! messageId) {
      console.error(`No message ID in SendEmailResponse for ${emailAddress}`);
    }
  } 
  catch (e:any) {
    console.error(`Error sending email to ${emailAddress}`);
    console.error(e);
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
