import { DeleteObjectsCommandOutput, ObjectIdentifier, S3 } from "@aws-sdk/client-s3";
import { Affiliate, AffiliateTypes, Consenter, ExhibitForm as ExhibitFormData, YN } from "../../_lib/dao/entity";
import { ExhibitForm } from "../../_lib/pdf/ExhibitForm";
import { ExhibitFormSingle } from "../../_lib/pdf/ExhibitFormSingle";
import { BucketItem } from "./BucketItem";
import { BucketItemMetadata, BucketItemMetadataParms, ItemType } from "./BucketItemMetadata";


/**
 * This class deals with "CRUD" operations against an s3 bucket with respect to single exhibit forms.
 * Among actions performed are putting new pdf files into the bucket and retrieving them out as byte arrays.
 */
export class ExhibitBucket {
  private bucket:BucketItem;

  constructor(bucket:BucketItem) {
    this.bucket = bucket;
  }

  /**
   * Add a single exhibit form to the s3 bucket
   * @param entityId 
   * @param affiliateEmail 
   * @param savedDate 
   */
  public add = async (parms:BucketItemMetadataParms):Promise<string> => {
    try {
      const { EXHIBIT } = ItemType;
      const { affiliateEmail, correction=false, entityId, savedDate=new Date()} = parms;
      const { consenter, consenter: { email:consenterEmail, exhibit_forms=[] }, bucketName:Bucket, region } = this.bucket;

      if( ! affiliateEmail) {
        throw new Error(`Cannot add single exhibit form to ${consenterEmail} for ${entityId}: Affiliate email missing`);
      }

      // Get the s3 object key for the single exhibit form pdf to be stored.
      const Key = BucketItemMetadata.toBucketObjectKey({
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
      console.log(`ExhibitBucket.add: ${JSON.stringify({ bucket:this.bucket, parms }, null, 2)}`);
      throw(e);
    }
  }

  /**
   * Add each single exhibit form of a full exhibit form to the bucket
   * @param entityId 
   */
  public addAll = async (entityId:string, savedDate?:Date):Promise<string[]> => {
    console.log(`Adding each single exhibit form of full exhibit form to bucket: ${JSON.stringify({entityId, savedDate }, null, 2)}`);
    const { consenter: { exhibit_forms }} = this.bucket;
    const exhibitForm:ExhibitFormData|undefined = exhibit_forms?.find(ef => {
      return ef.entity_id = entityId;
    });
    if( ! exhibitForm) {
      throw new Error(`Consenter has no exhibit form for: ${entityId}`);
    }
    const { affiliates=[], sent_timestamp } = exhibitForm;
    if( ! savedDate && sent_timestamp) {
      savedDate = new Date(sent_timestamp);
    }
    const keys = [] as string[];
    for(let i=0; i<affiliates.length; i++) {
      const key = await this.add({ entityId, affiliateEmail: affiliates[i].email, savedDate } as BucketItemMetadataParms);
      keys.push(key);
    }
    return keys;
  }

  /**
   * Add a corrected single exhibit form to the bucket
   * @param entityId 
   * @param affiliate 
   */
  public correct = async (parms:BucketItemMetadataParms) => {
    parms.correction = true;
    await this.add(parms);
  }

  /**
   * Delete any of the following from the s3 bucket for a specific consenter:
   *   1) Any one single exhibit form
   *   2) All single exhibit forms, original and corrected, for a particular affiliate.
   *   3) All single exhibit forms, original and corrected, for a partiular entity.
   *   4) All single exhibit forms, original and corrected, for a particular consenter.
   * @param parms 
   * @returns 
   */
  public delete = async (parms:BucketItemMetadataParms):Promise<DeleteObjectsCommandOutput|void> => {
    try {
      const { deleteMultipleItems, listObjects } = this.bucket;

      // 1) Get a list of objects to delete and the prefix that encompasses them all.
      const listedObjectsOutput = await listObjects(parms);
      const { Prefix, listedObjects } = listedObjectsOutput;
      if( ! listedObjects.Contents || listedObjects.Contents.length === 0) {
        console.log(`No single exhibit forms found in ${Prefix}`);
        return;
      }

      // 2) Delete the listed objects
      const objIds = listedObjects.Contents.map((item) => ({ Key: item.Key })) as ObjectIdentifier[];
      const deleteResult:DeleteObjectsCommandOutput = await deleteMultipleItems(objIds);

      // 3) Handle any returned errors
      const errors = (deleteResult.Errors ?? []).length;
      if(errors > 0) {
        let msg = `Errors encountered deleting folder ${Prefix}:`
        deleteResult.Errors?.forEach(e => {
          msg = `${msg}
          ${JSON.stringify(e, null, 2)}`;
        });
        throw new Error(msg);
      }

      // 4) Handle any other sign of non-deletion result
      const deletes = (deleteResult.Deleted ?? []).length;
      if(deletes == 0) {
        throw new Error(`Failure to delete any items from ${Prefix}`)
      }

      // 5) Log success message
      console.log("Successfully deleted:", (deleteResult.Deleted ?? []).length, "objects");
      return deleteResult;
    }
    catch(e) {
      console.log(`ExhibitBucket.delete: ${JSON.stringify({ bucket:this.bucket, parms }, null, 2)}`);
      throw(e);
    }
  }

  /**
   * Get the bytes for a specific single exhibit form pdf file from s3 as identified by the supplied metadata.
   * 
   * @param parms Will usually be specific enough to identify a specific object in s3, but may indicate
   * the original single exhibit form AND all of its corrections. If the latter is the case, the bytes of the
   * most recent correction pdf file are returned.
   * @returns 
   */
  public get = async (parms:BucketItemMetadataParms|string): Promise<Uint8Array> => {
    try {
      const { fromBucketObjectKey, toBucketObjectKey } = BucketItemMetadata;
      if(typeof parms == 'string') {
        // metadata is in the form of an s3 object key, so convert it to a metadata object.
        parms = fromBucketObjectKey(parms);
      }

      // 1) Get the metadata to be used to identity a specific pdf file
      const { bucket } = this;
      const { bucketName:Bucket, region, consenter: { email:consenterEmail } } = bucket;
      const bimd = new BucketItemMetadata(bucket);
      const singleParms = await bimd.getLatest(parms);
      if( ! singleParms) {
        return new Uint8Array(); // Return an empty array
      }

      // 2) Convert the metadata into an s3ObjectKey that points to a specific pdf file.
      const s3ObjectKey = toBucketObjectKey(Object.assign({ consenterEmail }, singleParms));

      // 3) Get the bytes for the specific pdf file out of the bucket.
      const s3 = new S3({ region });
      const output = await s3.getObject({ Bucket, Key:s3ObjectKey });
      const { Body } = output;
      if(Body) {
        return Body.transformToByteArray();
      }
      return new Uint8Array(); // Return an empty array
    }
    catch(e) {
      console.log(`ExhibitBucket.get: ${JSON.stringify({ bucket:this.bucket, parms }, null, 2)}`);
      throw(e);
    }
  }

  /**
   * Query for all single exhibit forms stored in s3 that match the supplied metadata.
   * @param parms 
   * @param dryrun 
   * @returns 
   */
  public query = async (parms:BucketItemMetadataParms|string, dryrun:boolean=false):Promise<Uint8Array[]> => { 
    try {
      if(typeof parms == 'string') {
        // metadata is in the form of an s3 object key, so convert it to a metadata object.
        parms = BucketItemMetadata.fromBucketObjectKey(parms);
      }

      const { bucketName:Bucket, region, listObjects } = this.bucket;
      const emptyArray = [] as Uint8Array[];

      // Get a list of objects to delete and the prefix that encompasses them all.
      const listedObjectsOutput = await listObjects(parms);
      const { Prefix, listedObjects: { Contents } } = listedObjectsOutput;
      if( ! Contents || Contents.length === 0) {
        console.log(`No single exhibit forms found in ${Prefix}`);
        return emptyArray;
      }

      // Print out objects that would be fetched if dryrun and return
      if(dryrun) {
        console.log(`Get results for s3 prefix: ${Prefix}
        ${JSON.stringify(Contents, null, 2)}`);
        return emptyArray;
      }

      // List all the objects to get
      const keys = [] as string[];
      for(let i=0; i<Contents.length; i++) {
        const { Key } = Contents[i];
        if(Key) {
          keys.push(Key);
        }
      }

      // Get each object in the list
      const s3 = new S3({ region });
      const pdfs = [] as Uint8Array[];
      for(let i=0; i<keys.length; i++) {
        const output = await s3.getObject({ Bucket, Key:keys[i] });
        const { Body } = output;
        if(Body) {
          const pdf = await Body.transformToByteArray();
          pdfs.push(pdf);
        }
      }

      return pdfs
    }
    catch(e) {
      console.log(`ExhibitBucket.query: ${JSON.stringify({ bucket:this.bucket, parms }, null, 2)}`);
      throw(e);
    }
  }
}




/**
 * RUN MANUALLY: Modify the region, task, and deleteDepth as needed.
 */
const { argv:args } = process;
if(args.length > 4 && args[2] == 'RUN_MANUALLY_CONSENTER_BUCKET_ITEM') {

  // Process args:
  const region = args[3];
  const task = args[4] as 
    'add'|'add-all'|'correct'|'get'|'delete-consenter'|'delete-entity'|'delete-affiliate'|'delete-atomic';

  // Other configs:
  const dummyDateString = '2024-08-09T20:21:12.955Z';
  const dummyDate = new Date(dummyDateString);
  const { EXHIBIT } = ItemType;
  process.env.REGION = region;

  // Mocked consenter
  const consenter = {
    email: 'elmer@warnerbros.com',
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
        entity_id: 'entity_id_1',
        sent_timestamp: dummyDateString,
        affiliates: [
          { 
            affiliateType: AffiliateTypes.EMPLOYER,
            org: 'Warner Bros.', 
            fullname: 'Foghorn Leghorn', 
            email: 'foghorn@warnerbros.com',
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

  let bucket:ExhibitBucket;
  let entityId:string;
  let affiliateEmail:string;
  const itemBucket = new BucketItem(consenter, 'ett-dev-exhibit-forms');
  switch(task) {
    case "add":
      bucket = new ExhibitBucket(itemBucket);
      entityId = consenter.exhibit_forms![0].entity_id;
      affiliateEmail = consenter.exhibit_forms![0].affiliates![0].email;
      bucket.add({ entityId, affiliateEmail, savedDate:dummyDate } as BucketItemMetadataParms)
        .then(() => {
          console.log('done');
        })
        .catch(e => {
          console.error(e);
        });
      break;
    case "add-all":
      bucket = new ExhibitBucket(itemBucket);
      entityId = consenter.exhibit_forms![0].entity_id;
      bucket.addAll(entityId, dummyDate)
        .then(() => {
          console.log('done');
        })
        .catch(e => {
          console.error(e);
        });
      break;
    case "correct":
      bucket = new ExhibitBucket(itemBucket);
      entityId = consenter.exhibit_forms![0].entity_id;
      affiliateEmail = consenter.exhibit_forms![0].affiliates![2].email;
      bucket.correct({ entityId, affiliateEmail, savedDate:dummyDate } as BucketItemMetadataParms)
        .then(() => {
          console.log('done');
        })
        .catch(e => {
          console.error(e);
        });
      break;
    case "delete-consenter": case "delete-entity": case "delete-affiliate": case "delete-atomic":
      bucket = new ExhibitBucket(itemBucket);
      entityId = consenter.exhibit_forms![0].entity_id;
      affiliateEmail = consenter.exhibit_forms![0].affiliates![2].email;
      let metadata = {} as BucketItemMetadataParms;
      const deleteDepth = task.split('-')[1];
      switch(deleteDepth) {
        case "consenter":
          metadata = { itemType:EXHIBIT, entityId:'all' }; break;
        case "entity":
          metadata = { itemType:EXHIBIT, entityId }; break;
        case "affiliate":
          metadata = { itemType:EXHIBIT, entityId, affiliateEmail }; break;
        case "atomic":
          metadata = { itemType:EXHIBIT, entityId, affiliateEmail, correction:true, savedDate:dummyDate}; break;
      }
      bucket.delete(metadata)
        .then(() => {
          console.log('done');
        })
        .catch(e => {
          console.error(e);
        });
      break;
    case "get":
      bucket = new ExhibitBucket(itemBucket);
      entityId = consenter.exhibit_forms![0].entity_id;
      bucket.query({ itemType:EXHIBIT, entityId }, true);
      break;
  }
}