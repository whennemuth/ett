import { DeleteObjectsCommandOutput, ObjectIdentifier, S3 } from "@aws-sdk/client-s3";
import { IContext } from "../../../../contexts/IContext";
import { AffiliateTypes, Consenter, ExhibitForm as ExhibitFormData, YN } from "../../_lib/dao/entity";
import { BucketItem } from "./BucketItem";
import { BucketExhibitForm } from "./BucketItemExhibitForm";
import { BucketItemMetadata, BucketItemMetadataParms, ExhibitFormsBucketEnvironmentVariableName, ItemType } from "./BucketItemMetadata";
import { log } from "../../Utils";


/**
 * This class deals with bulk "CRUD" operations against an s3 bucket with respect to single exhibit forms.
 */
export class ExhibitBucket {
  private bucket:BucketItem;
  private consenter:Consenter;

  constructor(consenter:Consenter) {
    this.bucket = new BucketItem();
    this.consenter = consenter;
  }

  private putAll = async (entityId:string, task:'add'|'correct', savedDate?:Date):Promise<string[]> => {
    log({entityId, savedDate }, `Adding each ${task=='add' ? 'new' : 'corrected'} single exhibit form to bucket`);
    const { consenter, bucket, consenter: { email:consenterEmail, exhibit_forms }} = this;
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
      const metadata =  { consenterEmail, entityId, affiliateEmail: affiliates[i].email, savedDate } as BucketItemMetadataParms;
      let key:string;
      const exhibitForm = new BucketExhibitForm(metadata);
      switch(task) {
        case "add":
          key = await exhibitForm.add(consenter);
          break;
        case "correct":
          key = await exhibitForm.correct(consenter);
          break;
      }
      keys.push(key);
    }
    return keys;
  }

  /**
   * Add each new single exhibit form of a full exhibit form to the bucket
   * @param entityId 
   */
  public addAll = async (entityId:string, savedDate?:Date):Promise<string[]> => {
    return this.putAll(entityId, 'add', savedDate);
  }

  /**
   * Add each corrected single exhibit form of a full exhibit form to the bucket
   * @param entityId 
   */
  public correctAll = async (entityId:string, savedDate?:Date):Promise<string[]> => {
    return this.putAll(entityId, 'correct', savedDate);
  }

  /**
   * Delete any of the following from the s3 bucket for a specific consenter:
   *   1) Any one single exhibit form
   *   2) All single exhibit forms, original and corrected, for a particular affiliate.
   *   3) All single exhibit forms, original and corrected, for a partiular entity.
   *   4) All single exhibit forms, original and corrected, for a particular consenter.
   * @param metadata 
   * @returns 
   */
  public deleteAll = async (metadata:BucketItemMetadataParms):Promise<DeleteObjectsCommandOutput|void> => {
    try {
      const { deleteMultipleItems, listKeys } = this.bucket;
      const { toBucketFolderKey } = BucketItemMetadata;
      const Prefix = toBucketFolderKey(metadata);

      // 1) Get a list of objects to delete and the prefix that encompasses them all.
      const output = await listKeys(metadata);
      const { keys } = output;
      if( keys.length === 0) {
        log(`No single exhibit forms found in ${Prefix}`);
        return;
      }

      // 2) Delete the listed objects
      const objIds = keys.map(Key => ({ Key })) as ObjectIdentifier[];
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
      log({ bucket:this.bucket, parms: metadata }, `ExhibitBucket.delete`);
      throw(e);
    }
  }

  /**
   * Download all single exhibit forms stored in s3 that match the supplied metadata as an array of byte arrays.
   * @param metadata 
   * @param dryrun 
   * @returns 
   */
  public query = async (metadata:BucketItemMetadataParms|string, dryrun:boolean=false):Promise<Uint8Array[]> => { 
    try {
      if(typeof metadata == 'string') {
        // metadata is in the form of an s3 object key, so convert it to a metadata object.
        metadata = BucketItemMetadata.fromBucketObjectKey(metadata);
      }

      const { bucketName:Bucket, region, listKeys } = this.bucket;
      const emptyArray = [] as Uint8Array[];
      const { toBucketFolderKey } = BucketItemMetadata;
      const Prefix = toBucketFolderKey(metadata);

      // Get a list of objects to delete and the prefix that encompasses them all.
      const output = await listKeys(metadata);
      const { keys } = output;
      if( keys.length === 0) {
        log(`No single exhibit forms found in ${Prefix}`);
        return emptyArray;
      }

      // Print out objects that would be fetched if dryrun and return
      if(dryrun) {
        log(keys, `Get results for s3 prefix: ${Prefix}`);
        return emptyArray;
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
      log({ bucket:this.bucket, parms: metadata }, `ExhibitBucket.query`);
      throw(e);
    }
  }
}



/**
 * RUN MANUALLY: Modify the region, task, and deleteDepth as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/consenting-person/BucketItemExhibitForms.ts')) {

  // Process args:
  const task = 'query' as 
    'add-all'|'query'|'delete-consenter'|'delete-entity'|'delete-affiliate'|'delete-atomic';

  // Other configs:
  const dummyDate = new Date();
  const dummyDateString = dummyDate.toISOString();;
  const { EXHIBIT } = ItemType;

  // Mocked consenter
  const consenter = {
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
        entity_id: 'eea2d463-2eab-4304-b2cf-cf03cf57dfaa',
        sent_timestamp: dummyDateString,
        affiliates: [
          { 
            affiliateType: AffiliateTypes.EMPLOYER,
            org: 'Warner Bros.', 
            fullname: 'Foghorn Leghorn', 
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

  let entityId:string;
  let affiliateEmail:string;

  (async () => {
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, REGION, TAGS: { Landscape }} = context;
    const { email:consenterEmail } = consenter;
    process.env.REGION = REGION;
    process.env[ExhibitFormsBucketEnvironmentVariableName] = `${STACK_ID}-${Landscape}-exhibit-forms`;
    const bucket = new ExhibitBucket(consenter) as ExhibitBucket;

    switch(task) {
      case "add-all":
        entityId = consenter.exhibit_forms![0].entity_id;
        bucket.addAll(entityId, dummyDate)
          .then(() => {
            log('done');
          })
          .catch(e => {
            console.error(e);
          });
        break;
      case "query":
        entityId = consenter.exhibit_forms![0].entity_id;
        bucket.query({ consenterEmail, itemType:EXHIBIT, entityId }, true);
        break;
      default:
        // Deletions
        entityId = consenter.exhibit_forms![0].entity_id;
        affiliateEmail = consenter.exhibit_forms![0].affiliates![2].email;
        let metadata = { consenterEmail } as BucketItemMetadataParms;
        const deleteDepth = task.split('-')[1];
        switch(deleteDepth) {
          case "consenter":
            metadata = { consenterEmail, itemType:EXHIBIT, entityId:'all' }; break;
          case "entity":
            metadata = { consenterEmail, itemType:EXHIBIT, entityId }; break;
          case "affiliate":
            metadata = { consenterEmail, itemType:EXHIBIT, entityId, affiliateEmail }; break;
          case "atomic":
            metadata = { consenterEmail, itemType:EXHIBIT, entityId, affiliateEmail, correction:true, savedDate:dummyDate}; break;
        }
        bucket.deleteAll(metadata)
          .then(() => {
            log('done');
          })
          .catch(e => {
            console.error(e);
          });
        break;
    }

  })();
}