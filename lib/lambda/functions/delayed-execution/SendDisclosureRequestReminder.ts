import { IContext } from "../../../../contexts/IContext";
import { DelayedExecutions } from "../../../DelayedExecution";
import { DelayedLambdaExecution, PostExecution, ScheduledLambdaInput } from "../../_lib/timer/DelayedExecution";
import { EggTimer, PeriodType } from "../../_lib/timer/EggTimer";
import { debugLog, log } from "../../Utils";
import { DisclosureEmailParms, DisclosureRequestReminderEmail } from "../authorized-individual/DisclosureRequestEmail";
import { BucketInventory } from "../consenting-person/BucketInventory";
import { BucketItemMetadata, ExhibitFormsBucketEnvironmentVariableName, ItemType } from "../consenting-person/BucketItemMetadata";
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
    const { s3ObjectKeyForExhibitForm, s3ObjectKeyForDisclosureForm } = disclosureEmailParms;

    if(await fresherCopiesFound(s3ObjectKeyForExhibitForm)) {
      console.log('Cancelling disclosure request reminder.');
    }
    else {
      const sent = await new DisclosureRequestReminderEmail(disclosureEmailParms).send();

      if(sent) {
        console.log(`Disclosure request reminder sent!`);
      }
      else {
        console.error('Disclosure request reminder NOT sent!');
      }
    }

    if(purgeForms) {
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

/**
 * There is the possibility that a consenting individual has made corrections to the single exhibit form that
 * matches the s3ObjectKey provided. This function determines if that is the case. If so, then s3ObjectKey is 
 * an older "version" and should not be sent in the disclosure request reminder. 
 * 
 * NOTE: The older copy could be deleted here, but an event bridge rule will do that anyway per the standard schedule.
 * @param Key 
 * @returns 
 */
const fresherCopiesFound = async (s3ObjectKey:string):Promise<boolean> => {
  const { entityId, itemType, affiliateEmail, consenterEmail } = BucketItemMetadata.fromBucketObjectKey(s3ObjectKey);
  if( ! consenterEmail) return false;
  if( ! affiliateEmail) return false;
  const inventory = await BucketInventory.getInstance(consenterEmail, entityId);
  const fresherS3ObjectKey = inventory.getLatestAffiliateItem(affiliateEmail, itemType);
  console.log(`A fresher (corrected) copy for the ${itemType} form was found ${
    JSON.stringify({
      olderForm: s3ObjectKey,
      newerForm: fresherS3ObjectKey
    })
  }`);
  return fresherS3ObjectKey ? true : false;
}

const validateEnvironment = ():void => {
  const { REGION } = process.env;
  const bucketName = process.env[ExhibitFormsBucketEnvironmentVariableName];

  if( ! bucketName) {
    throw new Error(`${ExhibitFormsBucketEnvironmentVariableName} enviroment variable not found!`);
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
    process.env[ExhibitFormsBucketEnvironmentVariableName] = bucketName;
    process.env.PREFIX = prefix;
    process.env.REGION = REGION;

    /**
     * Create a delayed execution that will send the exhibit form that was just saved to the
     * bucket in a disclosure request reminder email as an attachment, delete it when done.
     * @param s3ObjectKey 
     */
    const scheduleDisclosureRequestReminder = async (disclosureEmailParms:DisclosureEmailParms, callback:Function) => {
      const functionName = `${prefix}-${DelayedExecutions.DisclosureRequestReminder.coreName}`;
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
