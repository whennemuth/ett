import { DeleteObjectCommandOutput, S3 } from "@aws-sdk/client-s3";
import { IContext } from "../../../../contexts/IContext";
import { DelayedExecutions } from "../../../DelayedExecution";
import { Consenter } from "../../_lib/dao/entity";
import { DelayedLambdaExecution, PostExecution, ScheduledLambdaInput } from "../../_lib/timer/DelayedExecution";
import { EggTimer, PeriodType } from "../../_lib/timer/EggTimer";
import { debugLog, log } from "../../Utils";
import { BucketInventory } from "../consenting-person/BucketInventory";
import { DisclosureItemsParms, Tags } from "../consenting-person/BucketItem";
import { ExhibitBucket } from "../consenting-person/BucketItemExhibitForms";
import { BucketItemMetadata, BucketItemMetadataParms, ExhibitFormsBucketEnvironmentVariableName, ItemType } from "../consenting-person/BucketItemMetadata";
import { TagInspector } from "../consenting-person/BucketItemTag";
import { getTestItem } from "./TestBucketItem";

export const ID = 'S3EFP';
export const Description = 'S3 exhibit form purge';

/**
 * This lambda is triggered by one-time event bridge schedules to issue disclosure request email
 * reminders to affiliate recipients.
 * @param event 
 * @param context 
 * @returns 
 */
export const handler = async (event:ScheduledLambdaInput, context:any) => {
  const { lambdaInput, groupName, scheduleName } = event;
  const { DISCLOSURE, EXHIBIT } = ItemType;

  try {
    debugLog({ event, context });

    validateEnvironment();

    validateLambdaInput(lambdaInput);

    const { s3ObjectKeyForDisclosureForm, s3ObjectKeyForExhibitForm } = lambdaInput as DisclosureItemsParms;

    const purgedExhibitForm = await purgeFormFromBucket(EXHIBIT, s3ObjectKeyForExhibitForm, checkAbort);

    const purgedDisclosureForm = await purgeFormFromBucket(DISCLOSURE, s3ObjectKeyForDisclosureForm, checkAbort);

    if(purgedExhibitForm && purgedDisclosureForm) {
      // No sense in keeping around any correction forms that existed in the same directory since they are now redundant
      await purgeExhibitCorrectionForms(s3ObjectKeyForExhibitForm);
    }

    await checkConsenterCorrectionForms(s3ObjectKeyForExhibitForm);
  }
  catch(e:any) {    
    log(e);
  }
  finally { 
    await PostExecution().cleanup(scheduleName, groupName);
  }
}

/**
 * If any pdf file stored in s3 under a specific /consenter/exhibit/affiliate subdirectory is tagged to
 * indicate it has been used as an attachment in a disclosure request email, deletion of the current 
 * s3ObjectKey should be aborted because it may be needed in the followup disclosure reminder emails
 * that are yet to be sent, and deletion should be aborted so they are available when that time comes.
 * @param s3ObjectKey 
 * @returns 
 */
export const checkAbort = async (s3ObjectKey:string):Promise<boolean> => {
  return new TagInspector(Tags.DISCLOSED).tagExistsAmong(s3ObjectKey, ItemType.EXHIBIT);
}

/**
 * Remove all correction forms from a consenter/entity/affiliate bucket directory.
 * @param s3ObjectKeyForExhibitForm 
 */
export const purgeExhibitCorrectionForms = async (s3ObjectKeyForExhibitForm:string):Promise<void> => {
  const { fromBucketObjectKey } = BucketItemMetadata;
  const parms = fromBucketObjectKey(s3ObjectKeyForExhibitForm);
  const { entityId, affiliateEmail, consenterEmail } = parms;
  const metadata = { consenterEmail, entityId, affiliateEmail, correction:true } as BucketItemMetadataParms;
  const bucket = new ExhibitBucket({ email:consenterEmail } as Consenter);
  await bucket.deleteAll(metadata);
}

/**
 * If there are no exhibit forms, disclosure forms, and exhibit correction (correction of affiliates) forms 
 * in the bucket for a consenter, then purge all correction forms (correction of the consenter themselves) 
 * for that consenter.
 * @param s3ObjectKeyForExhibitForm 
 */
export const checkConsenterCorrectionForms = async (s3ObjectKeyForExhibitForm:string):Promise<void> => {
  const { fromBucketObjectKey } = BucketItemMetadata;
  const parms = fromBucketObjectKey(s3ObjectKeyForExhibitForm);
  const { consenterEmail } = parms;
  const inventory = await BucketInventory.getInstance(consenterEmail);
  const correctionForms = inventory.getAllFormsOfType(ItemType.CORRECTION_FORM);
  if(correctionForms.length == inventory.getKeys().length) {
    log(`Deleting all consenter correction forms (${correctionForms.length} form(s)) for ${consenterEmail}`);
    for(const key of inventory.getKeys()) {
      await purgeFormFromBucket(ItemType.CORRECTION_FORM, key);
    }
  }
}

/**
 * Remove the exhibit form from the s3 bucket.
 * @param exhibitFormS3ObjectKey 
 */
export const purgeFormFromBucket = async (itemType:ItemType, Key:string, checkAbort?:Function):Promise<boolean> => {
  if(checkAbort) {
    const abort = await checkAbort(Key) as boolean;
    if(abort) {
      console.log(`Aborting purge of pdf from s3: ${Key}`);
      return false;
    }
  }
  log(`Deleting ${itemType} form: ${Key}`);
  const { REGION } = process.env;
  const Bucket = process.env[ExhibitFormsBucketEnvironmentVariableName];
  const s3 = new S3({ region:REGION });
  const output = await s3.deleteObject({ Bucket, Key }) as DeleteObjectCommandOutput;  
  log(`${Key} deleted.`);
  log(output);
  return true;
}

const validateEnvironment = ():void => {
  const { REGION } = process.env;
  const bucketName = process.env[ExhibitFormsBucketEnvironmentVariableName];
  if( ! bucketName) {
    throw new Error(`${bucketName} enviroment variable not found!`);
  }
  if( ! REGION) {
    throw new Error('REGION enviroment variable not found!');
  }
}

const validateLambdaInput = (lambdaInput:DisclosureItemsParms):void => {
  const { consenterEmail, s3ObjectKeyForDisclosureForm, s3ObjectKeyForExhibitForm } = lambdaInput;
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
 * RUN MANUALLY: 
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/delayed-execution/PurgeExhibitFormFromBucket.ts')) {

  const task = 'immediate' as 'immediate'|'scheduled';
  const { MINUTES } = PeriodType;
  const { EXHIBIT, DISCLOSURE } = ItemType;

  (async () => {
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, REGION, ACCOUNT, TAGS: { Landscape }} = context;
    const prefix = `${STACK_ID}-${Landscape}`;
    const bucketName = `${prefix}-exhibit-forms`;
    process.env[ExhibitFormsBucketEnvironmentVariableName] = bucketName;
    process.env.PREFIX = prefix;
    process.env.REGION = REGION;

    /**
     * Create a delayed execution that will delete the single exhibit form from the bucket it was just put into.
     * @param s3ObjectKey 
     */
    const createDelayedExectionToRemoveBucketItem = async(lambdaInput:DisclosureItemsParms, callback:Function) => {
      const functionName = `${prefix}-${DelayedExecutions.ExhibitFormBucketPurge.coreName}`;
      const lambdaArn = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${functionName}`;
      await callback(lambdaArn, lambdaInput);
    }

    const { loadFormIntoBucket, consenter } = (await getTestItem());

    const s3ObjectKeyForExhibitForm = await loadFormIntoBucket(EXHIBIT);

    const s3ObjectKeyForDisclosureForm = await loadFormIntoBucket(DISCLOSURE);

    const lambdaInput = {
      consenterEmail:consenter.email,
      s3ObjectKeyForDisclosureForm,
      s3ObjectKeyForExhibitForm
    } as DisclosureItemsParms;

    let callback;
    switch(task) {
      case "immediate":
        callback = async (lambdaArn:string, lambdaInput:DisclosureItemsParms) => {
          await handler({ lambdaInput } as ScheduledLambdaInput, null);
        };
        await createDelayedExectionToRemoveBucketItem(lambdaInput, callback);
        break;
      case "scheduled":
        callback = async (lambdaArn:string, lambdaInput:DisclosureItemsParms) => {
          const delayedTestExecution = new DelayedLambdaExecution(lambdaArn, lambdaInput);
          const timer = EggTimer.getInstanceSetFor(2, MINUTES); 
          await delayedTestExecution.startCountdown(timer, ID, `${Description} (TESTING)`);
        };
        await createDelayedExectionToRemoveBucketItem(lambdaInput, callback);
        break;
    }
  })();
}
