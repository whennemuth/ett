import { DeleteObjectsCommandOutput } from "@aws-sdk/client-s3";
import { Affiliate, AffiliateTypes, Consenter, ExhibitForm, YN } from "../../_lib/dao/entity";
import { BucketDisclosureForm } from "./BucketItemDisclosureForm";
import { BucketExhibitForm } from "./BucketItemExhibitForm";
import { ExhibitBucket } from "./BucketItemExhibitForms";
import { BucketItemMetadata, BucketItemMetadataParms, ItemType } from "./BucketItemMetadata";
import { ConsenterInfo, getConsenterInfo, getCorrectableAffiliates } from "./ConsentingPersonUtils";
import { ExhibitCorrectionEmail } from "./correction/ExhibitCorrectionEmail";
import { error, invalidResponse, log, warn } from "../../Utils";
import { BucketItem, Tags } from "./BucketItem";
import { sendDisclosureRequest } from "../authorized-individual/DisclosureRequest";
import { TagInspector } from "./BucketItemTag";
import { INVALID_RESPONSE_MESSAGES } from "./ConsentingPerson";
import { ConsentStatus } from "./ConsentStatus";
import { BucketInventory } from "./BucketInventory";
import { LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { Target } from "@aws-sdk/client-scheduler";
import { lookupSpecificSchedules } from "../../_lib/timer/Lookup";
import { DisclosureRequestReminderLambdaParms, ID } from "../delayed-execution/SendDisclosureRequestReminder";
import { IContext } from "../../../../contexts/IContext";

export type ExhibitFormCorrection = {
  entity_id:string, updates:Affiliate[], appends:Affiliate[], deletes:string[]
}
  
/**
 * Take in corrected exhibit form data for a full exhibit form previously submitted to a specified entity.
 * Perform bucket appends and removals where indicated and send corrected single exhibit form to each 
 * authorized individual of the entity (and affiliate(s) if disclosure requests have already been sent to them).
 * @param email 
 * @param exhibitForm 
 * @returns 
 */
export const correctExhibit = async (consenterEmail:string, corrections:ExhibitFormCorrection): Promise<LambdaProxyIntegrationResponse> => {
  const { entity_id, appends=[], deletes=[], updates=[] } = corrections;
  const { toBucketFolderKey } = BucketItemMetadata
  const inventory = await BucketInventory.getInstance(consenterEmail, entity_id);
  const emails = inventory.getAffiliateEmails();  
  const disclosuresRequestCache = [] as string[]; // Cache the output of any s3 object tag lookups

  const consenterInfo = await getConsenterInfo(consenterEmail, false) as ConsenterInfo;
  if( ! consenterInfo) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.noSuchConsenter);
  }

  const { consentStatus } = consenterInfo;
  const { ACTIVE, EXPIRED } = ConsentStatus;
  if(consentStatus != ACTIVE) {
    if(consentStatus == EXPIRED) {
      return invalidResponse(INVALID_RESPONSE_MESSAGES.expiredConsent);
    }
    if(consenterInfo?.consenter?.active != YN.Yes) {
      return invalidResponse(INVALID_RESPONSE_MESSAGES.inactiveConsenter);
    }
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingConsent);
  }

  // Validate that no existing affiliate from the bucket matches any affiliate being submitted as new.
  const invalidAppend = appends.find(affiliate => emails.includes(affiliate.email));
  if(invalidAppend) {
    return invalidResponse(`The affiliate "${invalidAppend.email} can only be replaced, not submitted as a new entry.`);
  }

  type SendDisclosureRequestParms = {
    EF_S3ObjectKey:string,
    DR_S3ObjectKey:string,
    affiliateEmail:string,
    reSend?:boolean
  }
  /**
   * If disclosure requests have already been sent to the updated affiliates, reissue them and schedule
   * 2 new reminders. Any existing schedules will defer to these new ones - a corresponding check in the
   * event bridge schedule lambda function ensures this).
   * @param EF_S3ObjectKey 
   * @param DR_S3ObjectKey 
   * @param affiliateEmail 
   */
  const sendDisclosureRequestEmails = async (parms:SendDisclosureRequestParms, allAffiliates:boolean=false) => {
    const { DR_S3ObjectKey, EF_S3ObjectKey, affiliateEmail, reSend=false } = parms;
    let metadata = { consenterEmail, entityId:entity_id, affiliateEmail, itemType:ItemType.EXHIBIT } as BucketItemMetadataParms;
    let sendable = true;

    if(allAffiliates) {
      delete metadata.affiliateEmail
    }

    if(reSend) {
      // A disclosure request is resendable if one was already sent for the affiliate
      let s3ObjectPath = toBucketFolderKey(metadata);
      if( ! disclosuresRequestCache.includes(s3ObjectPath)) {
        // Check s3 tagging on s3 objects for evidence of a specific disclosure request having been sent.
        let tagFound = await new TagInspector(Tags.DISCLOSED).tagExistsAmong(s3ObjectPath, ItemType.EXHIBIT);
        if(tagFound) {
          disclosuresRequestCache.push(s3ObjectPath);
        }
        else if ( ! allAffiliates) {
          // expand the search to ANY affiliate in case this is a new affiliate (we are not allowing some 
          // affiliates to have been sent disclosure requests while others have not)
          await sendDisclosureRequestEmails(parms, true);
          return;
        }
        else {          
          sendable = false;
        }
      }
    }

    if(sendable) {

      // Send the disclosure request
      await sendDisclosureRequest(consenterEmail, entity_id, affiliateEmail);

      // Tag the items in s3 bucket accordingly.
      const now = new Date().toISOString();
      const bucket = new BucketItem();       
      await bucket.tag(EF_S3ObjectKey, Tags.DISCLOSED, now);
      await bucket.tag(DR_S3ObjectKey, Tags.DISCLOSED, now);
      return;
    }
    log({ consenterEmail, entity_id, affiliateEmail }, `No initial disclosure request to reissue for`);
  }

  // Handle deleted affiliates
  const successfulDeletes = [] as string[];
  if(deletes.length > 0) {
    for(let i=0; i<deletes.length; i++) {

      // Bail if for some weird reason the target of the correction cannot be found.
      if( ! inventory.hasAffiliate(deletes[i], entity_id)) {
        warn(
          { consenterEmail, entity_id, affiliateEmail:deletes[i] }, 
          'Attempt to delete an affiliate for which nothing deletable can be found'
        );
        continue;
      }

      // Delete the affiliate "directory" for the specified consenter/exhibit path in the bucket.
      // NOTE: Any event bridge schedules that schedule disclosure requests/reminders for the deleted items 
      // will search for them by key(s), fail to find them, error silently, and eventually themselves 
      // be deleted (if final reminder). This is easier than trying to find those schedules and delete them here.
      const result:DeleteObjectsCommandOutput|void = await new ExhibitBucket({ email:consenterEmail } as Consenter).deleteAll({
        consenterEmail,
        entityId:entity_id,
        affiliateEmail:deletes[i]
      } as BucketItemMetadataParms);
      if(result) {
        successfulDeletes.push(deletes[i]);
      }
    }
  }

  // Handle updated affiliates
  const successfulUpdates = [] as Affiliate[];
  if(updates.length > 0) {
    const consenter = Object.assign({}, consenterInfo.consenter);
    consenter.exhibit_forms = [ { entity_id, affiliates:updates } as ExhibitForm ];
    for(let i=0; i<updates.length; i++) {
      const { email:affiliateEmail } = updates[i];

      // Bail if for some weird reason the target of the correction cannot be found.
      if( ! inventory.hasAffiliate(affiliateEmail, entity_id)) {
        console.warn(`Attempt to correct an affiliate for which nothing correctable can be found: ${JSON.stringify({
          consenterEmail, entity_id, affiliateEmail
        }, null, 2)}`);
        continue;
      }

      // Add the corrected single exhibit form to the bucket for the updated affiliate.
      const EF_S3ObjectKey = await new BucketExhibitForm({ 
        entityId:entity_id, itemType:ItemType.EXHIBIT, affiliateEmail, consenterEmail 
      }).correct(consenter);

      // Add the corrected disclosure form to the bucket for the updated affiliate.
      const DR_S3ObjectKey = await new BucketDisclosureForm({
         metadata: { entityId:entity_id, itemType:ItemType.DISCLOSURE, affiliateEmail, consenterEmail }     
      }).correct(consenter);

      successfulUpdates.push(updates[i]);

      // Reissue disclosure requests if already sent 
      await sendDisclosureRequestEmails({ EF_S3ObjectKey, DR_S3ObjectKey, affiliateEmail, reSend:true });
    }
  }

  // Handle new affiliates
  if(appends.length > 0) {
    const consenter = Object.assign({}, consenterInfo.consenter);
    consenter.exhibit_forms = [ { entity_id, affiliates:appends } as ExhibitForm ];
    for(let i=0; i<appends.length; i++) {
      // Send out an automatic disclosure request to the new affiliates (even though the AI did not get a 
      // chance to review them) and create the customary reminder event bridge schedules.
      const { email:affiliateEmail } = appends[i];
      
      // Add a new single exhibit form to the bucket for the new affiliate.
      const EF_S3ObjectKey = await new BucketExhibitForm({ 
        entityId:entity_id, itemType:ItemType.EXHIBIT, affiliateEmail, consenterEmail 
      }).add(consenter);

      // Add a new disclosure form to the bucket for the new affiliate.
      const DR_S3ObjectKey = await new BucketDisclosureForm({
        metadata: { entityId:entity_id, itemType:ItemType.DISCLOSURE, affiliateEmail, consenterEmail }      
      }).add(consenter);

      // Reissue disclosure requests if already sent 
      await sendDisclosureRequestEmails( { EF_S3ObjectKey, DR_S3ObjectKey, affiliateEmail, reSend:true });
    }
  }

  // Handle all correction notification emails
  {
    corrections.deletes = successfulDeletes;
    corrections.updates = successfulUpdates;
    const correctionEmail = new ExhibitCorrectionEmail(consenterEmail, corrections);

    // Send an email to the entity reps about the affiliate updates, additions, and removals.
    await correctionEmail.sendToEntity();

    // Send an email to each affiliate that was updated notifiying them of the update.
    await correctionEmail.sendToAffiliates(await getQualifiedAffiliateFilter(consenterEmail, entity_id));
  }

  return getCorrectableAffiliates(consenterEmail, entity_id);
}

/**
 * If an affiliate has not been sent a disclosure request, then they should be excluded from receiving
 * the exhibit form correction email. The only way to determine this is to see if there is any event bridge
 * schedule in existence for disclosure request reminders to the affiliate with respect to the consenter and
 * entity. This function will return a function filters for affiliates who HAVE already been sent a disclosure request.
 * @param consenter_email 
 * @param entity_id 
 * @returns 
 */
const getQualifiedAffiliateFilter = async (consenter_email:string, entity_id:string):Promise<(email:string) => boolean> => {
  const region = process.env.REGION;
  const prefix = process.env.PREFIX;
  if( ! region) {
    throw new Error(`REGION environment variable not set`);
  }
  if( ! prefix) {
    throw new Error(`PREFIX environment variable not set`);
  }
  const landscape = prefix.split('-')[1];
  let targets = [] as Target[];
  const getBucketItemMetadataParms = (targetInput:string|undefined):BucketItemMetadataParms => {
    if( ! targetInput) return {} as BucketItemMetadataParms;
    const { lambdaInput } = JSON.parse(targetInput);
    const { disclosureEmailParms: { s3ObjectKeyForExhibitForm } } = lambdaInput as DisclosureRequestReminderLambdaParms
    return BucketItemMetadata.fromBucketObjectKey(s3ObjectKeyForExhibitForm);
  }
  try {
    targets = await lookupSpecificSchedules({ 
      region, 
      landscape,
      scheduleTypeId: ID,
      targetInputFilter: (targetInput:string|undefined):boolean => {
        const { consenterEmail, entityId } = getBucketItemMetadataParms(targetInput);        
        return entityId === entity_id && consenterEmail === consenter_email;
      }
    });
  }
  catch(e) {
    error(e);
  }
  finally {
    const emails = [] as string[];
    for(const target of targets) {
      if( ! target?.Input) continue;
      const { affiliateEmail } = getBucketItemMetadataParms(target.Input);
      if( ! affiliateEmail) continue;
      if( ! emails.includes(affiliateEmail)) {
        emails.push(affiliateEmail);
      }
    }
    return (email:string):boolean => emails.includes(email);
  }
}


const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/consenting-person/ExhibitCorrect.ts')) {
  const task = 'getQualifiedAffiliateFilter' as 'correctExhibit' | 'getQualifiedAffiliateFilter';
  (async () => {
    try {
      switch(task) {
        case "getQualifiedAffiliateFilter":
          const context:IContext = await require('../../../../contexts/context.json');
          const { STACK_ID:app, REGION:region, TAGS: { Landscape:landscape }} = context;
          const prefix = `${app}-${landscape}`;
          process.env.PREFIX = prefix;
          process.env.REGION = region;
          const consenter_email = 'cp1@warhen.work'
          const entity_id = 'a27ef181-db7f-4e18-ade4-6a987d82e248';
          const filter = await getQualifiedAffiliateFilter(consenter_email, entity_id);

          for(const affiliate of [ 1, 2, 3, 4, 5, 6, 7, 8 ].map(i => `affiliate${i}@warhen.work`)) {
            if(filter(affiliate)) {
              console.log(`${affiliate} is qualified`);
            }
            else {
              console.log(`${affiliate} is NOT qualified`);
            }
          }
          break;
        case "correctExhibit":
          const corrections = {
            entity_id: "a27ef181-db7f-4e18-ade4-6a987d82e248",
            updates: [
              {
                email: "affiliate1@warhen.work",
                affiliateType: AffiliateTypes.EMPLOYER_PRIMARY,
                org: "My Neighborhood University",
                fullname: "Mister Rogers",
                title: "Daytime child television host",
                phone_number: "0123456789"
              }
            ],
            appends: [
              {
                affiliateType: AffiliateTypes.EMPLOYER,
                org: "School of Omelets",
                email: "affiliate3@warhen.work",
                fullname: "Humpty Dumpty",
                title: "Wall Sitter",
                phone_number: "0123456888"
            }
            ],
            deletes: []
          } as ExhibitFormCorrection;

          await correctExhibit('cp1@warhen.work', corrections);
          console.log(`done`);
          break;
      }

    }
    catch(reason) {
      console.error(reason);
    }
  })();
}