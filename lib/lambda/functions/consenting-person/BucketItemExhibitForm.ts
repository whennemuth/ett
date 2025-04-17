import { S3 } from "@aws-sdk/client-s3";
import { IContext } from "../../../../contexts/IContext";
import { Affiliate, AffiliateTypes, Consenter, ExhibitFormConstraints, FormTypes, YN } from "../../_lib/dao/entity";
import { ExhibitFormParms } from "../../_lib/pdf/ExhibitForm";
import { ExhibitFormSingleBoth } from "../../_lib/pdf/ExhibitFormSingleBoth";
import { ExhibitFormSingleCurrent } from "../../_lib/pdf/ExhibitFormSingleCurrent";
import { ExhibitFormSingleOther } from "../../_lib/pdf/ExhibitFormSingleOther";
import { IPdfForm } from "../../_lib/pdf/PdfForm";
import { deepClone, log } from "../../Utils";
import { BucketItem, Tags } from "./BucketItem";
import { BucketItemMetadata, BucketItemMetadataParms, ItemType } from "./BucketItemMetadata";
import { consentFormUrl } from "./ConsentingPersonUtils";

/**
 * This class deals with "CRUD" operations against a single exhibit form in the s3 bucket.
 */
export class BucketExhibitForm {
  private metadata:BucketItemMetadataParms;
  private bucket:BucketItem;

  constructor(metadata:BucketItemMetadataParms|string) {
    const { fromBucketObjectKey } = BucketItemMetadata;

    this.bucket = new BucketItem();
    if(typeof metadata == 'string') {
      // metadata is in the form of an s3 object key, so convert it to a metadata object.
      this.metadata = fromBucketObjectKey(metadata);
      return;
    }
    this.metadata = metadata;
  }

  /**
   * Add the exhibit form to the bucket.
   * @returns 
   */
  public add = async (consenter:Consenter, _correction:boolean=false):Promise<string> => {
    const { EXHIBIT } = ItemType;
    const { exhibit_forms=[] } = consenter;
    const { BOTH, CURRENT, OTHER } = ExhibitFormConstraints
    let { metadata, metadata: { 
      consenterEmail, constraint, entityId, affiliateEmail, correction=_correction, savedDate=new Date() }, 
      bucket: { bucketName:Bucket, region }
    } = this;

    try {

      if( ! affiliateEmail) {
        throw new Error(`Cannot add single exhibit form to ${consenterEmail} for ${entityId}: Affiliate email missing`);
      }

      // Get the s3 object key for the single exhibit form pdf to be stored.
      const Key = BucketItemMetadata.toBucketFileKey({
        itemType:EXHIBIT, consenterEmail, correction, entityId, affiliateEmail, savedDate
      });

      // Find the exhibit form in the consenter by entity ID.
      const exhibitForm = exhibit_forms.find(ef => {
        return ef.entity_id == entityId;
      });

      // Find the affiliate in the exhibit form by email
      const affiliate = exhibitForm?.affiliates?.find(a => {
        return a.email == affiliateEmail;
      }) as Affiliate;

      // Create a new single exhibit form pdf file
      const parms = {
        entity: { entity_id: entityId },
        consenter,
        // clone the exhibit form so that edits to fields that the  pdf generator makes will not affect the original.
        data: deepClone(exhibitForm), 
        consentFormUrl: consentFormUrl(consenterEmail),
      } as ExhibitFormParms;

      let pdf:IPdfForm
      const _constraint = constraint ?? BOTH;
      switch(constraint) {
        case CURRENT:
          pdf = ExhibitFormSingleCurrent.getInstance(parms);
          break;
        case OTHER:
          pdf = ExhibitFormSingleOther.getInstance(parms);
          break;
        case BOTH: default:
          pdf = ExhibitFormSingleBoth.getInstance(parms);
          break;
      }

      // Get the s3 client and the pdf file bytes
      const s3 = new S3({ region });
      const Body = await pdf!.getBytes();

      // Configure the constraint as a tag to the exhibit form in the bucket
      const constraintInfo = new URLSearchParams();
      constraintInfo.append('constraint', _constraint);
      constraintInfo.append('constraint_assigned_by_default', constraint ? 'false' : 'true');
      const Tagging = constraintInfo.toString();

      // Save the new single exhibit form pdf file to the s3 bucket
      log(`Adding ${Key}`);
      await s3.putObject({ Bucket, Key, Body, Tagging, ContentType: 'application/pdf' });

      // Return the object key of the exhibit form.
      return Key;
    }
    catch(e) {
      log(metadata, `ExhibitBucket.add`);
      throw(e);
    }
  }

  /**
   * Get the bytes for a specific single exhibit form pdf file from s3 as identified by the supplied metadata.
   * @returns 
   */
  public get = async (): Promise<Uint8Array> => {
    let { metadata, bucket } = this;
    try {
      return bucket.getObjectBytes(metadata);
    }
    catch(e) {
      log({ bucket, metadata }, `ExhibitBucket.get`);
      throw(e);
    }
  }

  /**
   * Delete a single exhibit form from the bucket
   * @returns 
   */
  public delete = async ():Promise<boolean> => {
    const { bucket, metadata } =  this;
    return bucket.deleteSingleItem(metadata);
  }

  /**
   * Add a corrected single exhibit form to the bucket
   */
  public correct = async (consenter:Consenter):Promise<string> => {
    return this.add(consenter, true);
  }

  /**
   * Apply a tag to an exhibit form in the bucket to mark it has already gone out in a disclosure request email.
   * @param date 
   * @returns 
   */
  public tagWithDiclosureRequestSentDate = async (date:string=new Date().toISOString()): Promise<boolean> => {
    const { bucket, metadata } = this;
    return bucket.tag(metadata, Tags.DISCLOSED, date);
  }

  /**
   * Determine if an exhibit form in the bucket has already gone out in a disclosure request email.
   * @returns 
   */
  public wasDisclosureRequestSent = async (): Promise<string|undefined> => {
    const { bucket, metadata } = this;
    return bucket.getTag(metadata, Tags.DISCLOSED);
  }
}




/**
 * RUN MANUALLY: Modify the region, task, and deleteDepth as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/consenting-person/BucketItemExhibitForm.ts')) {

  // Process args:
  const task = 'add' as 'add'|'correct'|'get'|'delete';

  const dummyDate = new Date();
  const dummyDateString = dummyDate.toISOString();;
  const { EXHIBIT } = ItemType;

  // Mocked consenter
  const consenter = {
    // email: 'elmer@warnerbros.com',
    email: 'cp3@warhen.work',
    active: YN.Yes,
    create_timestamp: dummyDateString,
    firstname: 'Elmer',
    middlename: 'F',
    lastname: 'Fudd',
    consented_timestamp: [ dummyDateString ],
    phone_number: '617-444-6666', 
    title: 'Wabbit Hunter',
    exhibit_forms: [
      {
        // entity_id: 'entity_id_1',
        entity_id: 'eea2d463-2eab-4304-b2cf-cf03cf57dfaa',
        sent_timestamp: dummyDateString,
        constraint: ExhibitFormConstraints.BOTH,
        formType: FormTypes.SINGLE,
        affiliates: [
          { 
            affiliateType: AffiliateTypes.EMPLOYER,
            org: 'Warner Bros.', 
            fullname: 'Foghorn Leghorn', 
            // email: 'foghorn@warnerbros.com',
            email: 'affiliate1@warhen.work',
            title: 'Head Rooster',
            phone_number: '617-333-4444'
          },
          {
            affiliateType: AffiliateTypes.ACADEMIC,
            org: 'Warner Bros.',
            fullname: 'Daffy D Duck',
            email: 'daffy@warnerbros.com',
            title: 'Sufferin Succotash!',
            phone_number: '781-999-0000'
          },
          {
            affiliateType: AffiliateTypes.OTHER,
            org: 'Warner Bros.',
            fullname: 'Bugs B Bunny',
            email: 'bugs@warnerbros.com',
            title: 'Head Rabbit',
            phone_number: '508-777-9999'
          }
        ]
      }
    ]
  } as Consenter;

  let exhibitForm:BucketExhibitForm;
  let entityId:string;
  let affiliateEmail:string;

  (async () => {
    const context:IContext = await require('../../../../contexts/context.json');
    const { REGION} = context;
    process.env.REGION = REGION;
    
    switch(task) {
      case "add":
        entityId = consenter.exhibit_forms![0].entity_id;
        affiliateEmail = consenter.exhibit_forms![0].affiliates![0].email;
        exhibitForm = new BucketExhibitForm({
           consenterEmail:consenter.email, entityId, affiliateEmail, savedDate:dummyDate 
        } as BucketItemMetadataParms);
        await exhibitForm.add(consenter);
        break;
      case "correct":
        entityId = 'eea2d463-2eab-4304-b2cf-cf03cf57dfaa';
        affiliateEmail = 'affiliate1@warhen.work';
        exhibitForm = new BucketExhibitForm({
          consenterEmail:consenter.email, entityId, affiliateEmail, savedDate:dummyDate 
        } as BucketItemMetadataParms);
        await exhibitForm.correct(consenter);
        break;
      case "delete":
        entityId = consenter.exhibit_forms![0].entity_id;
        affiliateEmail = consenter.exhibit_forms![0].affiliates![2].email;
        const metadata = { itemType:EXHIBIT, consenterEmail:consenter.email, entityId, affiliateEmail, correction:true, savedDate:dummyDate}
        exhibitForm = new BucketExhibitForm(metadata);
        await exhibitForm.delete();
        break;
      case "get":
        log('Not implemented');
        break;
    }
  })();
}