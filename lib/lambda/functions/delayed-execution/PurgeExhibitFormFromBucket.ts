import { DeleteObjectCommandOutput, GetObjectTaggingCommand, S3, Tag } from "@aws-sdk/client-s3";
import { IContext } from "../../../../contexts/IContext";
import { EXHIBIT_FORM_S3_PURGE } from "../../../DelayedExecution";
import { DelayedLambdaExecution, PostExecution, ScheduledLambdaInput } from "../../_lib/timer/DelayedExecution";
import { EggTimer, PeriodType } from "../../_lib/timer/EggTimer";
import { debugLog, log } from "../../Utils";
import { DisclosureItemsParms, Tags } from "../consenting-person/BucketItem";
import { ItemType } from "../consenting-person/BucketItemMetadata";
import { getTestItem } from "./TestBucketItem";


/**
 * This lambda is triggered by one-time event bridge rules to issue disclosure request email
 * reminders to affiliate recipients.
 * @param event 
 * @param context 
 * @returns 
 */
export const handler = async(event:ScheduledLambdaInput, context:any) => {
  const { lambdaInput, eventBridgeRuleName, targetId } = event;
  const { DISCLOSURE, EXHIBIT } = ItemType;

  try {
    debugLog({ event, context });

    validateEnvironment();

    validateLambdaInput(lambdaInput);

    const { s3ObjectKeyForDisclosureForm, s3ObjectKeyForExhibitForm } = lambdaInput as DisclosureItemsParms;

    await purgeFormFromBucket(EXHIBIT, s3ObjectKeyForExhibitForm, checkAbort);

    await purgeFormFromBucket(DISCLOSURE, s3ObjectKeyForDisclosureForm, checkAbort);
  }
  catch(e:any) {    
    log(e);
  }
  finally { 
    await PostExecution().cleanup(eventBridgeRuleName, targetId);
  }
}

/**
 * The deletion of pdf files from s3 will be aborted if they are tagged to indicate they have been used
 * as attachments in a disclosure request email. If so, they will be needed in the followup disclosure
 * reminder emails that are yet to be sent, and deletion should be aborted so the are available when 
 * that time comes.
 * @param Key 
 * @returns 
 */
export const checkAbort = async (Key:string):Promise<boolean> => {
  log(`Checking tags for: ${Key}`);
  try {
    const { REGION, EXHIBIT_FORMS_BUCKET_NAME } = process.env;
    const { DISCLOSED } = Tags;
    const s3 = new S3({ region:REGION });
    const command = new GetObjectTaggingCommand({ Bucket: EXHIBIT_FORMS_BUCKET_NAME, Key });
    const response = await s3.send(command);
    const disclosed = (response.TagSet ?? [] as Tag[]).find(tag => {
      const { Key, Value } = tag;
      if(Key == DISCLOSED) {
        console.log(`Aborting pdf purge: Pending disclosure requests will need it: ${JSON.stringify({ Key, disclosureRequestSent: Value })}`);
        return true;
      }
      return false;
    });

    // Abort if s3 object was found to have been tagged.
    return disclosed != undefined;
  } 
  catch(e) {
    log(e);
    return false;
  }
}

/**
 * Remove the exhibit form from the s3 bucket.
 * @param exhibitFormS3ObjectKey 
 */
export const purgeFormFromBucket = async (itemType:ItemType, Key:string, checkAbort?:Function):Promise<void> => {
  if(checkAbort) {
    const abort = await checkAbort(Key) as boolean;
    if(abort) {
      console.log(`Aborting purge of pdf from s3: ${Key}`);
      return;
    }
  }
  log(`Deleting ${itemType} form: ${Key}`);
  const { REGION, EXHIBIT_FORMS_BUCKET_NAME } = process.env;
  const s3 = new S3({ region:REGION });
  const output = await s3.deleteObject({ Bucket: EXHIBIT_FORMS_BUCKET_NAME, Key }) as DeleteObjectCommandOutput;  
  log(`${Key} deleted.`);
  log(output);
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
if(args.length > 3 && args[2] == 'RUN_MANUALLY_PURGE_EXHIBIT_FORM_FROM_BUCKET') {

  const task = args[3] as 'immediate'|'scheduled';
  const { MINUTES } = PeriodType;
  const { EXHIBIT, DISCLOSURE } = ItemType;

  (async () => {
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, REGION, ACCOUNT, TAGS: { Landscape }} = context;
    const prefix = `${STACK_ID}-${Landscape}`;
    const bucketName = `${prefix}-exhibit-forms`;
    process.env.EXHIBIT_FORMS_BUCKET_NAME = bucketName;
    process.env.PREFIX = prefix;
    process.env.REGION = REGION;

    /**
     * Create a delayed execution that will delete the single exhibit form from the bucket it was just put into.
     * @param s3ObjectKey 
     */
    const createDelayedExectionToRemoveBucketItem = async(lambdaInput:DisclosureItemsParms, callback:Function) => {
      const functionName = `${prefix}-${EXHIBIT_FORM_S3_PURGE}`;
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
          await delayedTestExecution.startCountdown(timer, `S3 exhibit form purge (TESTING)`);
        };
        await createDelayedExectionToRemoveBucketItem(lambdaInput, callback);
        break;
    }
  })();
}
