import { IContext } from "../../../../contexts/IContext";
import { DISCLOSURE_REQUEST_REMINDER } from "../../../DelayedExecution";
import { DelayedLambdaExecution, PostExecution, ScheduledLambdaInput } from "../../_lib/timer/DelayedExecution";
import { EggTimer, PeriodType } from "../../_lib/timer/EggTimer";
import { debugLog, log } from "../../Utils";
import { DisclosureEmailParms, DisclosureRequestReminderEmail } from "../authorized-individual/DisclosureRequestEmail";
import { ItemType } from "../consenting-person/BucketItemMetadata";
import { purgeFormFromBucket } from "./PurgeExhibitFormFromBucket";
import { getTestItem } from "./TestBucketItem";

export type DisclosureRequestReminderLambdaParms = {
  disclosureEmailParms: DisclosureEmailParms,
  purgeForms: boolean,
}

/**
 * This lambda is triggered by one-time event bridge rules to issue disclosure request email
 * reminders to affiliate recipients.
 * @param event 
 * @param context 
 * @returns 
 */
export const handler = async(event:ScheduledLambdaInput, context:any) => {
  const { lambdaInput={}, eventBridgeRuleName, targetId } = event;
  const { DISCLOSURE, EXHIBIT } = ItemType;

  try {
    debugLog({ event, context });

    validateEnvironment();

    validateLambdaInput(lambdaInput);

    const { disclosureEmailParms, purgeForms=false } = lambdaInput as DisclosureRequestReminderLambdaParms;

    const sent = await new DisclosureRequestReminderEmail(disclosureEmailParms).send();

    if(sent) {
      console.log(`Disclosure request reminder sent!`);
    }
    else {
      console.error('Disclosure request reminder NOT sent!');
    }

    if(purgeForms) {
      const { s3ObjectKeyForExhibitForm, s3ObjectKeyForDisclosureForm } = disclosureEmailParms;

      await purgeFormFromBucket(EXHIBIT, s3ObjectKeyForExhibitForm);

      await purgeFormFromBucket(DISCLOSURE, s3ObjectKeyForDisclosureForm);      
    }
  }
  catch(e:any) {    
    log(e);
  }
  finally { 
    await PostExecution().cleanup(eventBridgeRuleName, targetId);
  }
}

const validateEnvironment = ():void => {
  const { EXHIBIT_FORMS_BUCKET_NAME, REGION } = process.env;
  if( ! EXHIBIT_FORMS_BUCKET_NAME) {
    throw new Error('EXHIBIT_FORMS_BUCKET_NAME enviroment variable not found!');
  }
  if( ! REGION) {
    throw new Error('REGION enviroment variable not found!');
  }
}

const validateLambdaInput = (lambdaInput:DisclosureRequestReminderLambdaParms):void => {
  const { disclosureEmailParms: { consenterEmail, s3ObjectKeyForDisclosureForm, s3ObjectKeyForExhibitForm } } = lambdaInput as DisclosureRequestReminderLambdaParms;
  if( ! consenterEmail) {
    throw new Error('Lambda input is missing consenterEmail parameter!');
  }
  if( ! s3ObjectKeyForExhibitForm) {
    throw new Error('Lambda input is missing s3ObjectKeyForExhibitForm parameter!');
  }  
  if( ! s3ObjectKeyForDisclosureForm) {
    throw new Error('Lambda input is missing s3ObjectKeyForDisclosureForm parameter!');
  }
}



/**
 * RUN MANUALLY: Adjust the PeriodType and exhibit_forms entity_id values (must be existing for lookup) as necessary.
 */
const { argv:args } = process;
if(args.length > 3 && args[2] == 'RUN_MANUALLY_SEND_DISCLOSURE_REQUEST_REMINDER') {

  const task = args[3] as 'immediate'|'scheduled';
  const { MINUTES } = PeriodType;
  const { EXHIBIT, DISCLOSURE } = ItemType;

  (async () => {
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, REGION, ACCOUNT, TAGS: { Landscape } } = context;
    const prefix = `${STACK_ID}-${Landscape}`;
    const bucketName = `${prefix}-exhibit-forms`;
    process.env.EXHIBIT_FORMS_BUCKET_NAME = bucketName;
    process.env.PREFIX = prefix;
    process.env.REGION = REGION;

    /**
     * Create a delayed execution that will send the exhibit form that was just saved to the
     * bucket in a disclosure request reminder email as an attachment, delete it when done.
     * @param s3ObjectKey 
     */
    const scheduleDisclosureRequestReminder = async (disclosureEmailParms:DisclosureEmailParms, callback:Function) => {
      const functionName = `${prefix}-${DISCLOSURE_REQUEST_REMINDER}`;
      const lambdaArn = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${functionName}`;
      const lambdaInput = { disclosureEmailParms, purgeForms:true } as DisclosureRequestReminderLambdaParms;
      await callback(lambdaArn, lambdaInput);
    }

    const { loadFormIntoBucket, consenter } = (await getTestItem());

    const s3ObjectKeyForExhibitForm = await loadFormIntoBucket(EXHIBIT);

    const s3ObjectKeyForDisclosureForm = await loadFormIntoBucket(DISCLOSURE);

    const lambdaInput = {
      consenterEmail:consenter.email,
      s3ObjectKeyForDisclosureForm,
      s3ObjectKeyForExhibitForm
    } as DisclosureEmailParms;

    let callback;
    switch(task) {
      case "immediate":
        callback = async (lambdaArn:string, lambdaInput:DisclosureRequestReminderLambdaParms) => {
          await handler({ lambdaInput } as ScheduledLambdaInput, null);
        };
        await scheduleDisclosureRequestReminder(lambdaInput, callback);
        break;
      case "scheduled":
        callback = async (lambdaArn:string, lambdaInput:DisclosureRequestReminderLambdaParms) => {
          const delayedTestExecution = new DelayedLambdaExecution(lambdaArn, lambdaInput);
          const timer = EggTimer.getInstanceSetFor(2, MINUTES); 
          await delayedTestExecution.startCountdown(timer, `Disclosure request reminder with s3 cleanup (TESTING)`);
        };
        await scheduleDisclosureRequestReminder(lambdaInput, callback);
        break;
    }
  })();
}
