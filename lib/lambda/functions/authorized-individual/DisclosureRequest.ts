import { IContext } from "../../../../contexts/IContext";
import { DelayedExecutions } from "../../../DelayedExecution";
import { LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { Configurations } from "../../_lib/config/Config";
import { EntityCrud } from "../../_lib/dao/dao-entity";
import { ConfigNames, Entity } from "../../_lib/dao/entity";
import { DelayedLambdaExecution } from "../../_lib/timer/DelayedExecution";
import { EggTimer, PeriodType } from "../../_lib/timer/EggTimer";
import { errorResponse, invalidResponse, log, okResponse } from "../../Utils";
import { BucketInventory } from "../consenting-person/BucketInventory";
import { BucketDisclosureForm } from "../consenting-person/BucketItemDisclosureForm";
import { BucketExhibitForm } from "../consenting-person/BucketItemExhibitForm";
import { BucketItemMetadata, ExhibitFormsBucketEnvironmentVariableName, ItemType } from "../consenting-person/BucketItemMetadata";
import { DisclosureRequestReminderLambdaParms, ID as scheduleTypeId, Description as scheduleDescription } from "../delayed-execution/SendDisclosureRequestReminder";
import { DisclosureEmailParms, DisclosureRequestEmail, RecipientListGenerator } from "./DisclosureRequestEmail";

/**
 * Send a disclosure request email to affiliate with the required attachments.
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
      await delayedTestExecution.startCountdown(timer, scheduleTypeId, `${scheduleDescription}: ${configName} (${disclosureEmailParms.consenterEmail})`);
    }
    else {
      console.error(`Cannot schedule ${configName} ${scheduleDescription}: ${envVarName} variable is missing from the environment!`);
    }
  }

  // Define the parameters for identifying the disclosure form in the bucket
  const parms = {
    consenterEmail,
    emailType: "request",
    s3ObjectKeyForExhibitForm,
    s3ObjectKeyForDisclosureForm
  } as DisclosureEmailParms;

  // Get the list of recipients for the disclosure request
  const recipients = await new RecipientListGenerator(parms).generate();
  
  // Send the disclosure request
  const sent = await new DisclosureRequestEmail(parms).send(recipients);

  // Bail out if the email failed
  if( ! sent) {
    return errorResponse(`Email failure for disclosure request: ${JSON.stringify(parms, null, 2)}`);
  }

  // Tag the pdfs so that they are skipped over by the event bridge stale pdf bucket purging schedule:
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
 * Send all disclosure requests in all affiliates provided. 
 * @param consenterEmail 
 * @param entity_id 
 * @param affiliateEmails List of affiliate emails to send disclosure requests to. 
 * If empty, all affiliate emails in the s3 bucket sent to the entity by the consenter are looked up and used.
 * @returns 
 */
export const sendDisclosureRequests = async (consenterEmail:string, entity_id:string, affiliateEmails:string[]=[]):Promise<LambdaProxyIntegrationResponse> => {
  if(affiliateEmails.length == 0) {
    const inventory = await BucketInventory.getInstance(consenterEmail, entity_id);
    affiliateEmails.push(...inventory.getAffiliateEmails());
  }
  if(affiliateEmails.length == 0) {
    const entity = await EntityCrud({ entity_id } as Entity).read();
    if( ! entity) {
      return errorResponse(`No such entity: ${entity_id}`);
    }
    const { entity_name } = entity as Entity;
    return errorResponse(`No affiliate records found for consenter: ${consenterEmail} and entity: ${entity_name}`);
  }
  for(const affilliateEmail of affiliateEmails) {
    await sendDisclosureRequest(consenterEmail, entity_id, affilliateEmail);
  }
  return okResponse('Ok', {});
}




const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/authorized-individual/DisclosureRequest.ts')) {

  (async () => {
    // 1) Get context variables
    const context:IContext = await require('../../../../contexts/context.json');
    const { DisclosureRequestReminder: { coreName, targetArnEnvVarName } } = DelayedExecutions;
    const { STACK_ID, REGION, ACCOUNT, TAGS: { Landscape }} = context;
    const prefix = `${STACK_ID}-${Landscape}`;
    const bucketName = `${prefix}-exhibit-forms`;
    const discFuncName = `${prefix}-${coreName}`;
    process.env[targetArnEnvVarName] = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${discFuncName}`;
    process.env[ExhibitFormsBucketEnvironmentVariableName] = bucketName;

    const response = await sendDisclosureRequests('consenter@gmail.com', '54322755-3d89-4388-98c6-ed291ef74221');
    // Should return 500 if nothing in the bucket is found for the specified consenter and entity
    log(response, 'Response');
  })();
}