import { DeleteObjectCommandOutput, S3 } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from 'uuid';
import { IContext } from "../../../../contexts/IContext";
import { DISCLOSURE_REQUEST_REMINDER } from "../../../DelayedExecution";
import { AffiliateTypes, Consenter, YN } from "../../_lib/dao/entity";
import { DelayedLambdaExecution, PostExecution, ScheduledLambdaInput } from "../../_lib/timer/DelayedExecution";
import { EggTimer, PeriodType } from "../../_lib/timer/EggTimer";
import { debugLog, log } from "../../Utils";
import { DisclosureEmailParms, DisclosureRequestReminderEmail } from "../authorized-individual/DisclosureRequestEmail";
import { DisclosureFormBucket } from "../consenting-person/BucketDisclosureForms";
import { ExhibitBucket } from "../consenting-person/BucketExhibitForms";
import { BucketItem } from "../consenting-person/BucketItem";
import { ItemType } from "../consenting-person/BucketItemMetadata";

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

      await purgeFormFromBucket(s3ObjectKeyForExhibitForm);

      await purgeFormFromBucket(s3ObjectKeyForDisclosureForm);      
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
 * Remove the exhibit form from the s3 bucket.
 * @param exhibitFormS3ObjectKey 
 */
const purgeFormFromBucket = async (exhibitFormS3ObjectKey:string):Promise<void> => {
  log(`Deleting exhibit form: ${exhibitFormS3ObjectKey}`);
  const { REGION, EXHIBIT_FORMS_BUCKET_NAME } = process.env;
  const s3 = new S3({ region:REGION });
  const output = await s3.deleteObject({ 
    Bucket: EXHIBIT_FORMS_BUCKET_NAME, 
    Key: exhibitFormS3ObjectKey 
  }) as DeleteObjectCommandOutput;
  
  log(`${exhibitFormS3ObjectKey} deleted.`);
  log(output);
}




/**
 * RUN MANUALLY: Adjust the PeriodType and exhibit_forms entity_id values (must be existing for lookup) as necessary.
 */
const { argv:args } = process;
if(args.length > 3 && args[2] == 'RUN_MANUALLY_SEND_DISCLOSURE_REQUEST_REMINDER') {

  const task = args[3] as 'immediate'|'scheduled';
  const { MINUTES } = PeriodType;
  const dummyDate = new Date().toISOString();
  const consenter = {
    email: 'cp1@warhen.work',
    active: YN.Yes,
    consented_timestamp: dummyDate,
    create_timestamp: dummyDate,
    firstname: 'Mickey',
    lastname: 'Mouse',
    middlename: 'M',
    sub: uuidv4(),
    phone_number: '508-222-6666',
    title: 'Cartoon Character',
    exhibit_forms: [{
      entity_id: '961adc5c-3428-4b63-9c9b-e2434e66f03a',
      create_timestamp: dummyDate,
      sent_timestamp: dummyDate,
      affiliates: [{
        affiliateType: AffiliateTypes.ACADEMIC,
        email: 'affiliate1@warhen.work',
        fullname: 'Wile E Coyote',
        org: 'Warner Bros Inc.',
        phone_number: '800-222-3333',
        title: 'Inventor'
      }]
    }]
  } as Consenter

  (async () => {
    const { EXHIBIT, DISCLOSURE } = ItemType;
    const now = new Date();
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, REGION, ACCOUNT, TAGS: { Landscape } } = context;
    const prefix = `${STACK_ID}-${Landscape}`;
    const bucketName = `${prefix}-exhibit-forms`;
    process.env.EXHIBIT_FORMS_BUCKET_NAME = bucketName;
    process.env.PREFIX = prefix;
    process.env.REGION = REGION;

    /**
     * Put a single exhibit or disclosure form in the bucket
     * @returns The s3 object key of the added form.
     */
    const loadFormIntoBucket = async (itemType:ItemType,) => {
      const { entity_id:entityId, affiliates=[] } = consenter.exhibit_forms![0];
      const affiliateEmail = affiliates[0].email;
      let bucket:ExhibitBucket|DisclosureFormBucket;
      switch(itemType) {
        case EXHIBIT:
          bucket = new ExhibitBucket(new BucketItem(consenter));
          return bucket.add({ itemType:EXHIBIT, entityId, affiliateEmail, savedDate:now });      
        case DISCLOSURE:
          bucket = new DisclosureFormBucket(new BucketItem(consenter));
          return bucket.add({ itemType:DISCLOSURE, entityId, affiliateEmail, savedDate:now });
        }      
    }

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

    const s3ObjectKeyForExhibitForm = await loadFormIntoBucket(EXHIBIT);

    const s3ObjectKeyForDisclosureForm = await loadFormIntoBucket(DISCLOSURE);

    switch(task) {
      case "immediate":
        await scheduleDisclosureRequestReminder({
          consenterEmail:consenter.email,
          s3ObjectKeyForDisclosureForm,
          s3ObjectKeyForExhibitForm
        }, async (lambdaArn:string, lambdaInput:DisclosureRequestReminderLambdaParms) => {
          await handler({ lambdaInput } as ScheduledLambdaInput, null);
        });
        break;
      case "scheduled":
        await scheduleDisclosureRequestReminder({
          consenterEmail:consenter.email,
          s3ObjectKeyForDisclosureForm,
          s3ObjectKeyForExhibitForm
        }, async (lambdaArn:string, lambdaInput:DisclosureRequestReminderLambdaParms) => {
          const delayedTestExecution = new DelayedLambdaExecution(lambdaArn, lambdaInput);
          const timer = EggTimer.getInstanceSetFor(2, MINUTES); 
          await delayedTestExecution.startCountdown(timer);
          console.log(`Event bridge rule started for timeout: ${timer.getCronExpression()}`);
        });
        break;
    }
  })();
}
