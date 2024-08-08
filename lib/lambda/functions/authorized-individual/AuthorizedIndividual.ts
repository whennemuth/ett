import { SESv2Client, SendEmailCommand, SendEmailCommandInput, SendEmailResponse } from "@aws-sdk/client-sesv2";
import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { lookupUserPoolId } from "../../_lib/cognito/Lookup";
import { DAOFactory, DAOUser } from "../../_lib/dao/dao";
import { ENTITY_WAITING_ROOM } from "../../_lib/dao/dao-entity";
import { Entity, Roles, User } from "../../_lib/dao/entity";
import { debugLog, errorResponse, invalidResponse, log, lookupCloudfrontDomain, okResponse } from "../../Utils";
import { DemolitionRecord, EntityToDemolish } from "./Demolition";

export enum Task {
  DEMOLISH_ENTITY = 'demolish-entity',
  PING = 'ping'
};

/**
 * This function performs all actions a RE_AUTH_IND can take to accomplish their role in the system.
 * @param event 
 * @returns LambdaProxyIntegrationResponse
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
          return await demolishEntity(entity_id, notify, dryRun);

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
 * Remove the entity entirely. Includes user, invitations, and cognito userpool entries associated with the entity.
 * @param entity_id 
 * @param notify 
 * @param dryRun 
 * @returns LambdaProxyIntegrationResponse
 */
export const demolishEntity = async (entity_id:string, notify:boolean, dryRun?:boolean): Promise<LambdaProxyIntegrationResponse> => {
  // Bail out if missing the required entity_id parameter
  if( ! entity_id) {
    return invalidResponse('Bad Request: Missing entity_id parameter');
  }

  // Demolish the entity
  const entityToDemolish = new EntityToDemolish(entity_id);
  entityToDemolish.dryRun = dryRun||false;
  await entityToDemolish.demolish() as DemolitionRecord;

  // Bail out if the initial lookup for the entity failed.
  if( ! entityToDemolish.entity) {
    return invalidResponse(`Bad Request: Invalid entity_id: ${entity_id}`);
  }
  
  // For every user deleted by the demolish operation, notify them it happened by email.
  if(notify) {
    const isEmail = (email:string|undefined) => /@/.test(email||'');
    const emailAddresses:string[] = entityToDemolish.deletedUsers
      .map((user:User) => { return isEmail(user.email) ? user.email : ''; })
      .filter((email:string) => email);

    for(var i=0; i<emailAddresses.length; i++) {
      var email = emailAddresses[i];
      try {
        console.log(`Sending email to ${email}`);
        if(dryRun) {
          continue;
        }
        await notifyUserOfDemolition(email, entityToDemolish.entity);
        console.log('Email sent');
      }
      catch(reason) {
        console.error(`Error sending email to ${email}`);
        console.log(JSON.stringify(reason, Object.getOwnPropertyNames(reason), 2));
      }
    }
  }
  
  return okResponse('Ok', entityToDemolish.demolitionRecord);
}

/**
 * Send a single email to an address notifying the recipient about the entity being demolished.
 * @param emailAddress 
 * @returns LambdaProxyIntegrationResponse
 */
export const notifyUserOfDemolition = async (emailAddress:string, entity:Entity):Promise<void> => {
  console.log(`Notifying ${emailAddress} that entity ${entity.entity_id}: ${entity.entity_name} was demolished`);

  const FromEmailAddress = await getSysAdminEmail();

  const client = new SESv2Client({
    region: process.env.REGION
  });

  const command = new SendEmailCommand({
    Destination: {
      ToAddresses: [ emailAddress ],
    },
    FromEmailAddress,
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

  const response:SendEmailResponse = await client.send(command);
  const messageId = response?.MessageId;
  if( ! messageId) {
    console.error(`No message ID in SendEmailResponse for ${emailAddress}`);
  }
  if(response) {
    console.log(JSON.stringify(response, null, 2));
  }
}

/**
 * Get the email address of the first system administrator found in a lookup.
 * @returns 
 */
const getSysAdminEmail = async ():Promise<string|null> => {
  const dao:DAOUser = DAOFactory.getInstance({
    DAOType: 'user', Payload: { entity_id:ENTITY_WAITING_ROOM } as User
  }) as DAOUser;
  const users = await dao.read() as User[] | [] as User[];
  const sysadmins = users.filter((user:User) => user.role == Roles.SYS_ADMIN);
  if(sysadmins.length > 0) {
    return sysadmins[0].email;
  }
  return null;
}

/**
 * RUN MANUALLY: Modify the task, landscape, entity_id, and dryRun settings as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_AUTH_IND') {

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
    return lookupUserPoolId('ett-dev-cognito-userpool', region);
  }).then((userpoolId) => {

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
