import { SESv2Client, SendEmailCommand, SendEmailCommandInput, SendEmailResponse } from "@aws-sdk/client-sesv2";
import { CONFIG, IContext } from "../../../../contexts/IContext";
import { DelayedExecutions } from "../../../DelayedExecution";
import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { lookupUserPoolId } from "../../_lib/cognito/Lookup";
import { Configurations } from "../../_lib/config/Config";
import { DAOConsenter, DAOFactory, DAOUser } from "../../_lib/dao/dao";
import { ENTITY_WAITING_ROOM } from "../../_lib/dao/dao-entity";
import { ConfigNames, Consenter, Entity, Roles, User, YN } from "../../_lib/dao/entity";
import { PdfForm } from "../../_lib/pdf/PdfForm";
import { DelayedLambdaExecution } from "../../_lib/timer/DelayedExecution";
import { EggTimer, PeriodType } from "../../_lib/timer/EggTimer";
import { debugLog, errorResponse, invalidResponse, log, lookupCloudfrontDomain, okResponse } from "../../Utils";
import { BucketDisclosureForm } from "../consenting-person/BucketItemDisclosureForm";
import { BucketExhibitForm } from "../consenting-person/BucketItemExhibitForm";
import { BucketItemMetadata, ExhibitFormsBucketEnvironmentVariableName, ItemType } from "../consenting-person/BucketItemMetadata";
import { DisclosureRequestReminderLambdaParms } from "../delayed-execution/SendDisclosureRequestReminder";
import { lookupEntity } from "../re-admin/ReAdminUser";
import { DemolitionRecord, EntityToDemolish } from "./Demolition";
import { DisclosureEmailParms, DisclosureRequestEmail } from "./DisclosureRequestEmail";
import { ExhibitFormRequestEmail } from "./ExhibitFormRequestEmail";
import { EntityToCorrect } from "./correction/EntityCorrection";
import { Personnel } from "./correction/EntityPersonnel";

export enum Task {
  LOOKUP_USER_CONTEXT = 'lookup-user-context',
  DEMOLISH_ENTITY = 'demolish-entity',
  SEND_DISCLOSURE_REQUEST = 'send-disclosure-request',
  SEND_EXHIBIT_FORM_REQUEST = 'send-exhibit-form-request',
  GET_CONSENTERS = 'get-consenter-list',
  AMEND_ENTITY_NAME = 'amend-entity-name',  
  AMEND_ENTITY_USER = 'amend-entity-user',  
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

        case Task.LOOKUP_USER_CONTEXT:
          var { email, role } = parameters;
          return await lookupEntity(email, role);
          
        case Task.DEMOLISH_ENTITY:
          var { entity_id, dryRun=false, notify=true } = parameters;
          return await demolishEntity(entity_id, notify, dryRun);

        case Task.SEND_EXHIBIT_FORM_REQUEST:
          var { consenterEmail, entity_id } = parameters;
          return await sendExhibitFormRequest(consenterEmail, entity_id);

        case Task.SEND_DISCLOSURE_REQUEST:
          var { consenterEmail, entity_id, affiliateEmail } = parameters;
          return await sendDisclosureRequest(consenterEmail, entity_id, affiliateEmail);
      
        case Task.GET_CONSENTERS:
          var { fragment } = parameters;
          return await getConsenterList(fragment);

        case Task.AMEND_ENTITY_NAME:
          var { entity_id, name } = parameters;
          return await amendEntityName(entity_id, name);

        case Task.AMEND_ENTITY_USER:
          return await amendEntityUser(parameters);
      
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

/**
 * Send a single email to an address notifying the recipient about the entity being demolished.
 * @param emailAddress 
 * @returns LambdaProxyIntegrationResponse
 */
export const notifyUserOfDemolition = async (emailAddress:string, entity:Entity):Promise<void> => {
  log(`Notifying ${emailAddress} that entity ${entity.entity_id}: ${entity.entity_name} was demolished`);

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
    log(response);
  }
}

/**
 * Change the name of the specified entity
 * @param entity_id 
 * @param name 
 * @returns 
 */
const amendEntityName = async (entity_id:string, name:string): Promise<LambdaProxyIntegrationResponse> => {
  log({ entity_id, name }, `amendEntityName`)
  if( ! entity_id) {
    return invalidResponse('Missing entity_id parameter');
  }
  if( ! name) {
    return invalidResponse('Missing name parameter');
  }
  const corrector = new EntityToCorrect(new Personnel(entity_id));
  await corrector.correctEntity({ entity_id, entity_name:name } as Entity);
  return okResponse('Ok', {});
}

/**
 * Remove a user from the specified entity and optionally invite a replacement
 * @param parms 
 * @returns 
 */
const amendEntityUser = async (parms:any): Promise<LambdaProxyIntegrationResponse> => {
  log(parms, `amendEntityUser`)
  var { entity_id, replacerEmail, replaceableEmail, replacementEmail } = parms;
  if( ! entity_id) {
    return invalidResponse('Missing entity_id parameter');
  }
  if( ! replaceableEmail) {
    return invalidResponse('Missing replaceableEmail parameter');
  }

  const corrector = new EntityToCorrect(new Personnel(entity_id, replacerEmail));
  const corrected = await corrector.correctPersonnel(replaceableEmail, replacementEmail);
  if(corrected) {
    return okResponse('Ok', {});
  }
  return errorResponse(`Entity correction failure: ${corrector.getMessage()}`);
}

/**
 * Get the email address of the first system administrator found in a lookup.
 * @returns 
 */
const getSysAdminEmail = async ():Promise<string|null> => {
  const dao:DAOUser = DAOFactory.getInstance({
    DAOType: 'user', Payload: { entity_id:ENTITY_WAITING_ROOM } as User
  }) as DAOUser;
  const users = await dao.read() as User[] ?? [] as User[];
  const sysadmins = users.filter((user:User) => user.role == Roles.SYS_ADMIN);
  if(sysadmins.length > 0) {
    return sysadmins[0].email;
  }
  return null;
}

/**
 * Get a list of active consenting individuals whose name begins with the 
 * specified fragment of text.
 * @param fragment 
 * @returns 
 */
export const getConsenterList = async (fragment?:string):Promise<LambdaProxyIntegrationResponse> => {
  const dao:DAOConsenter = DAOFactory.getInstance({
    DAOType: "consenter", Payload: { active: YN.Yes } as Consenter
  }) as DAOConsenter;
  const consenters = await dao.read() as Consenter[] ?? [] as Consenter[];
  const mapped = consenters.map(consenter => {
    const { email, firstname, middlename, lastname } = consenter;
    const fullname = PdfForm.fullName(firstname, middlename, lastname);
    if( ! fragment) {
      return { email, fullname };
    }
    const match = fullname.toLowerCase().includes(fragment.toLowerCase());
    return match ? { email, fullname } : undefined;
  }).filter(s => { return s != undefined });
  return okResponse('Ok', { consenters:mapped });
}

/**
 * Send an email to a consenting individual to prompt them to submit their exhibit form through ETT.
 * @param consenterEmail 
 * @param entity_id 
 * @returns 
 */
export const sendExhibitFormRequest = async (consenterEmail:string, entity_id:string):Promise<LambdaProxyIntegrationResponse> => {

  const cloudfrontDomain = process.env.CLOUDFRONT_DOMAIN;
  if( ! cloudfrontDomain) {
    return errorResponse('Email failure for exhibit form request: CLOUDFRONT_DOMAIN environment variable not set!');
  }
  const sent = await new ExhibitFormRequestEmail(consenterEmail, entity_id, cloudfrontDomain).send();

  // Bail out if the email failed
  if( ! sent) {
    return errorResponse(`Email failure for exhibit form request: ${JSON.stringify({ consenterEmail, entity_id }, null, 2)}`);
  }
  
  return okResponse('Ok', {});
}

/**
 * Send a disclosure request email to affiliates with the required attachments.
 * @param consenterEmail 
 * @param entity_id 
 * @param affiliateEmail 
 * @returns 
 */
export const sendDisclosureRequest = async (consenterEmail:string, entity_id:string, affiliateEmail:string):Promise<LambdaProxyIntegrationResponse> => {

  const envVarName = DelayedExecutions.DisclosureRequestReminder.targetArnEnvVarName;
  const functionArn = process.env[envVarName];
  const configs = new Configurations();
  const { SECONDS } = PeriodType;

  if( ! functionArn) {
    return errorResponse('Cannot determine disclosure request lambda function arn from environment!');
  }

  const metadata = new BucketItemMetadata();
  const { EXHIBIT, DISCLOSURE } = ItemType;

  const s3ObjectKeyForExhibitForm = await metadata.getLatestS3ObjectKey({
    itemType:EXHIBIT, entityId: entity_id, affiliateEmail, consenterEmail
  });
  if( ! s3ObjectKeyForExhibitForm) {
    return invalidResponse(`Invalid Request: A matching exhibit form cannot be found for: ${JSON.stringify({ consenterEmail, entity_id, affiliateEmail}, null, 2)}`); 
  }

  const s3ObjectKeyForDisclosureForm = await metadata.getLatestS3ObjectKey({
    itemType:DISCLOSURE, entityId: entity_id, affiliateEmail, consenterEmail
  });
  if( ! s3ObjectKeyForDisclosureForm) {
    return invalidResponse(`Invalid Request: A matching disclosure form cannot be found for: ${JSON.stringify({ consenterEmail, entity_id, affiliateEmail}, null, 2)}`); 
  }
  
  /**
   * Create a delayed execution that will send the exhibit form that was just saved to the bucket in a
   * disclosure request reminder email as an attachment, delete it when done if it is the second reminder.
   * @param s3ObjectKey 
   */
  const scheduleDisclosureRequestReminder = async (disclosureEmailParms:DisclosureEmailParms, configName:ConfigNames) => {
    const envVarName = DelayedExecutions.DisclosureRequestReminder.targetArnEnvVarName;
    const functionArn = process.env[envVarName];
    if(functionArn) {
      const lambdaInput = { 
        disclosureEmailParms,
        purgeForms: (configName == ConfigNames.SECOND_REMINDER)
      } as DisclosureRequestReminderLambdaParms;
      const delayedTestExecution = new DelayedLambdaExecution(functionArn, lambdaInput);
      const waitTime = (await configs.getAppConfig(configName)).getDuration();
      const timer = EggTimer.getInstanceSetFor(waitTime, SECONDS); 
      await delayedTestExecution.startCountdown(timer, `Disclosure request: ${configName} (${disclosureEmailParms.consenterEmail})`);
    }
    else {
      console.error(`Cannot schedule ${configName} disclosure request reminder: ${envVarName} variable is missing from the environment!`);
    }
  }

  // Send the disclosure request
  const parms = {
    consenterEmail,
    emailType: "request",
    s3ObjectKeyForExhibitForm,
    s3ObjectKeyForDisclosureForm
  } as DisclosureEmailParms;

  const sent = await new DisclosureRequestEmail(parms).send();

  // Bail out if the email failed
  if( ! sent) {
    return errorResponse(`Email failure for disclosure request: ${JSON.stringify(parms, null, 2)}`);
  }

  // Tag the pdfs so that they are skipped over by the event bridge stale pdf database purging rule:
  const exhibitForm = new BucketExhibitForm(s3ObjectKeyForExhibitForm);
  const disclosureForm = new BucketDisclosureForm({ metadata: s3ObjectKeyForDisclosureForm });
  let tagged = false;
  tagged ||= await exhibitForm.tagWithDiclosureRequestSentDate();
  tagged &&= await disclosureForm.tagWithDiclosureRequestSentDate();
  if( ! tagged) {
    console.warn(`Tagging failed for pdf forms and so they may be purged from s3 BEFORE disclosure request reminders are triggered and will look for them.`);
  }

  // Schedule the disclosure request reminders:
  parms.emailType = "reminder";
  await scheduleDisclosureRequestReminder(parms, ConfigNames.FIRST_REMINDER);
  await scheduleDisclosureRequestReminder(parms, ConfigNames.SECOND_REMINDER);

  return okResponse('Ok', {});
}


/**
 * RUN MANUALLY: Modify the task, landscape, entity_id, and dryRun settings as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/authorized-individual/AuthorizedIndividual.ts')) {

  const task:Task = Task.GET_CONSENTERS;
  const { DisclosureRequestReminder, HandleStaleEntityVacancy } = DelayedExecutions;

  (async () => {
    // 1) Get context variables
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, REGION, ACCOUNT, TAGS: { Landscape }} = context;
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

    // 5) Set environment variables
    process.env[DisclosureRequestReminder.targetArnEnvVarName] = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${discFuncName}`;
    process.env[HandleStaleEntityVacancy.targetArnEnvVarName] = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${staleFuncName}`;
    process.env[ExhibitFormsBucketEnvironmentVariableName] = bucketName;
    process.env.PREFIX = prefix
    process.env.CLOUDFRONT_DOMAIN = cloudfrontDomain;
    process.env.USERPOOL_ID = userpoolId;
    process.env.REGION = REGION;

    let _event = {
      headers: {},
      requestContext: {
        authorizer: {
          claims: {
            username: '417bd590-f021-70f6-151f-310c0a83985c',
            sub: '417bd590-f021-70f6-151f-310c0a83985c'
          }
        }
      }
    } as any;

    switch(task as Task) {
      case Task.LOOKUP_USER_CONTEXT:
        log('NOT IMPLEMENTED');
        break;

      case Task.DEMOLISH_ENTITY:
        // Define the payload to go in the event object
        _event.headers[AbstractRoleApi.ETTPayloadHeader] = JSON.stringify({ task, parameters: { 
          entity_id: 'db542060-7de0-4c55-be58-adc92671d63a', 
          dryRun:true 
        }} as IncomingPayload);        
        break;

      case Task.SEND_DISCLOSURE_REQUEST:
        // Create a reduced app config just for this test
        const { FIRST_REMINDER, SECOND_REMINDER } = ConfigNames;
        const configs = { useDatabase:false, configs: [
          { name: FIRST_REMINDER, value: '180', config_type: 'duration', description: 'testing' },
          { name: SECOND_REMINDER, value: '240', config_type: 'duration', description: 'testing' },
        ]} as CONFIG;
        
        // Set the config as an environment variable
        process.env[Configurations.ENV_VAR_NAME] = JSON.stringify(configs);

        // Define the payload to go in the event object
        _event.headers[AbstractRoleApi.ETTPayloadHeader] = JSON.stringify({ task, parameters: {
          consenterEmail: "cp1@warhen.work",
          entity_id: "3ef70b3e-456b-42e8-86b0-d8fbd0066628",
          affiliateEmail: "affiliate2@warhen.work"
        }} as IncomingPayload);
        break;

      case Task.GET_CONSENTERS:
        const fragment = 'dd' as string | undefined;
        _event.headers[AbstractRoleApi.ETTPayloadHeader] = JSON.stringify({ task, parameters: {
          fragment
        }} as IncomingPayload);
        break;

      case Task.PING:
        log('NOT IMPLEMENTED');
        break;

      default:
        log('MISSING/INVALID TASK');
        break;
    }

    try {
      const response = await handler(_event) as LambdaProxyIntegrationResponse;
      log(response);
    }
    catch(e) {
      log(e);
    }  
  })();
}
