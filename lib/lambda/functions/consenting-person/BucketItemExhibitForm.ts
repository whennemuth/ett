import { S3 } from "@aws-sdk/client-s3";
import { Affiliate, AffiliateTypes, Consenter, YN } from "../../_lib/dao/entity";
import { ExhibitForm } from "../../_lib/pdf/ExhibitForm";
import { ExhibitFormSingle } from "../../_lib/pdf/ExhibitFormSingle";
import { BucketItem, Tags } from "./BucketItem";
import { BucketItemMetadata, BucketItemMetadataParms, ItemType } from "./BucketItemMetadata";

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
      // parms is in the form of an s3 object key, so convert it to a metadata object.
      this.metadata = fromBucketObjectKey(metadata);
      return;
    }
    this.metadata = metadata;
  }

  /**
   * Add the disclosure form to the bucket.
   * @returns 
   */
  public add = async (consenter:Consenter, _correction:boolean=false):Promise<string> => {
    const { EXHIBIT } = ItemType;
    const { exhibit_forms=[] } = consenter;
    let { metadata, metadata: { 
      consenterEmail, entityId, affiliateEmail, correction=_correction, savedDate=new Date() }, 
      bucket, bucket: { bucketName:Bucket, region }
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
      const pdf = new ExhibitFormSingle(new ExhibitForm({
        entity_id: entityId,
        affiliates: [ affiliate ]
      }), consenter, affiliate.email);

      // Save the new single exhibit form pdf file to the s3 bucket
      const s3 = new S3({ region });
      const Body = await pdf.getBytes();
      console.log(`Adding ${Key}`);
      await s3.putObject({ Bucket, Key, Body, ContentType: 'application/pdf' });

      // Return the object key of the exhibit form.
      return Key;
    }
    catch(e) {
      console.log(`ExhibitBucket.add: ${JSON.stringify({ bucket, metadata }, null, 2)}`);
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
      console.log(`ExhibitBucket.get: ${JSON.stringify({ bucket, metadata }, null, 2)}`);
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
if(args.length > 4 && args[2] == 'RUN_MANUALLY_CONSENTER_EXHIBIT_FORMS') {

  // Process args:
  const region = args[3];
  const task = args[4] as 'add'|'correct'|'get'|'delete';

  const dummyDate = new Date();
  const dummyDateString = dummyDate.toISOString();;
  const { EXHIBIT } = ItemType;
  process.env.REGION = region;

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
        console.log('Not implemented');
        break;
    }
  })();
}