import { SendEmailCommand, SendEmailCommandInput, SendEmailResponse, SESv2Client } from "@aws-sdk/client-sesv2";
import { LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { Entity, roleFullName, Roles, User } from "../../_lib/dao/entity";
import { DemolitionRecord, EntityToDemolish } from "../../_lib/demolition/Demolition";
import { errorResponse, invalidResponse, log, okResponse } from "../../Utils";
import { IContext } from "../../../../contexts/IContext";
import * as ctx from '../../../../contexts/context.json';

/**
 * Remove the entity entirely. Includes user, invitations, and cognito userpool entries associated with the entity.
 * @param entity_id 
 * @param notify 
 * @param dryRun 
 * @returns LambdaProxyIntegrationResponse
 */
export const demolishEntity = async (entity_id:string, notify:boolean, dryRun?:boolean): Promise<LambdaProxyIntegrationResponse> => {
  try {
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
          log(`Sending email to ${email}`);
          if(dryRun) {
            continue;
          }
          await notifyUserOfDemolition(email, entityToDemolish.entity);
          log('Email sent');
        }
        catch(reason) {
          log(reason, `Error sending email to ${email}`);
        }
      }
    }    
    return okResponse('Ok', entityToDemolish.demolitionRecord);
  }
  catch(e:any) {
    log(e);
    return errorResponse(`ETT error: ${e.message}`);
  }
}

/**
 * Send a single email to an address notifying the recipient about the entity being demolished.
 * @param emailAddress 
 * @returns LambdaProxyIntegrationResponse
 */
export const notifyUserOfDemolition = async (emailAddress:string, entity:Entity):Promise<void> => {
  log(`Notifying ${emailAddress} that entity ${entity.entity_id}: ${entity.entity_name} was demolished`);

  const client = new SESv2Client({
    region: process.env.REGION
  });

  const context:IContext = <IContext>ctx;

  const command = new SendEmailCommand({
    Destination: {
      ToAddresses: [ emailAddress ],
    },
    FromEmailAddress: `noreply@${context.ETT_DOMAIN}`,
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
                  However, an ${roleFullName(Roles.RE_AUTH_IND)} has opted to cancel the registration process for this entity. 
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
    log(response);
  }
}