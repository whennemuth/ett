import { S3 } from "@aws-sdk/client-s3";
import { IContext } from "../../../../../contexts/IContext";
import { ConsenterCrud } from "../../../_lib/dao/dao-consenter";
import { Consenter } from "../../../_lib/dao/entity";
import { CorrectionForm } from "../../../_lib/pdf/CorrectionForm";
import { BucketInventory } from "../BucketInventory";
import { BucketItem } from "../BucketItem";
import { BucketItemMetadata, BucketItemMetadataParms, ExhibitFormsBucketEnvironmentVariableName, ItemType } from "../BucketItemMetadata";
import { log } from "../../../Utils";

/**
 * This class deals with "CRUD" operations against an s3 bucket with respect to consenter correction forms.
 * Among actions performed are putting new pdf files into the bucket and retrieving them out as byte arrays.
 */
export class BucketCorrectionForm {
  private oldConsenter:Consenter;
  private newConsenter:Consenter;
  // or...
  private metadata:BucketItemMetadataParms;

  private inventory:BucketInventory;

  private constructor() { /* Do nothing - just blocking non-factory instance creation */ }
  
  /**
   * Get an instance you plan to involve in rendering and saving a new correction form
   * @param newConsenter 
   * @param oldConsenter 
   */
  public static getInstanceForCreation = (newConsenter:Consenter, oldConsenter:Consenter):BucketCorrectionForm => {
    const form = new BucketCorrectionForm();
    form.newConsenter = newConsenter;
    form.oldConsenter = oldConsenter;
    return form;
  }

  /**
   * Get an instance you that represents a correction form that already exists and you either plan to 
   * pull out of the bucket or whose s3 object key you want to break into parts and use for analysis.
   */
  public static getInstanceForReading = async (metadata:string|BucketItemMetadataParms):Promise<BucketCorrectionForm> => {
    const { fromBucketObjectKey } = BucketItemMetadata;
    if(typeof metadata == 'string') {
      // metadata is in the form of an s3 object key, so convert it to a metadata object.
      metadata = fromBucketObjectKey(metadata);
    }

    if( ! metadata.itemType) {
      metadata.itemType = ItemType.CORRECTION_FORM;
    }
    const form = new BucketCorrectionForm();

    // If the provided metadata is specific to a file, return the instance.
    if(metadata.savedDate) {
      form.metadata = metadata;
      return form;
    }

    // The provided metadata was not specific to a file, so query the bucket for the latest correction form.
    const bimd = new BucketItemMetadata();
    const singleMetadata = await bimd.getLatest(metadata) as BucketItemMetadataParms;
    form.metadata = singleMetadata;
    return form;
  }

  /**
   * Render the consenter correction form pdf and drop in the top level bucket directory for the consenter
   * @returns 
   */
  public add = async (pdf?:CorrectionForm):Promise<string> => {
    const { toBucketFileKey, fromBucketObjectKey } = BucketItemMetadata;
    const { CORRECTION_FORM } = ItemType;
    const { oldConsenter, newConsenter } = this;
    const bucket = new BucketItem();
    const { bucketName:Bucket, region } = bucket;

    try {
      // Get the s3 object key for the consenter correction form pdf to be stored.
      const Key = toBucketFileKey({
        consenterEmail:newConsenter.email, itemType:CORRECTION_FORM, entityId:'all'
      });
      this.metadata = fromBucketObjectKey(Key);

      // Create a new consenter correction form pdf file if one was not provided
      if( ! pdf) {
        pdf = new CorrectionForm(oldConsenter, newConsenter);
      }

      // Save the new consenter correction form pdf file to the s3 bucket
      log(`Saving consenter correction form to the s3 bucket: ${Key}`);
      const s3 = new S3({ region });
      const Body = await pdf.getBytes();
      log(`Adding ${Key}`);
      await s3.putObject({ Bucket, Key, Body, ContentType: 'application/pdf' });

      // Return the object key of the consenter correction form.
      return Key;
    }
    catch(e) {
      log({ oldConsenter, newConsenter }, `ConsenterCorrectionFormBucket.add`);
      throw(e);
    }
  }

  /**
   * A consenter correction form is redundant if there is no other sendable form type whose timestamp indicates 
   * it was rendered BEFORE the correction form itself was created. By "sendable" is meant either a form that
   * has not been corrected, or its most recent correction. The idea here is that any such form rendered AFTER a
   * correction form is submitted would reflect those corrections anyway.
   * @param inventory 
   */
  public isRedundant = async (inventory:BucketInventory=this.inventory):Promise<boolean> => {
    const { metadata: { consenterEmail, savedDate } } = this;
    if( ! inventory) {
      inventory = await BucketInventory.getInstance(consenterEmail);
      this.inventory = inventory;
    }
    const contents = inventory.getAllLatestForms();
    const dependents = contents.filter(metadata => {
      const { itemType, savedDate:date } = metadata;
      return itemType != ItemType.CORRECTION_FORM && date!.getTime() < savedDate!.getTime();
    });
    return dependents.length == 0;
  }

  /**
   * Get the most recent consenter correction form
   * @returns 
   */
  public get = async (): Promise<Uint8Array> => {
    const { CORRECTION_FORM } = ItemType;
    const { metadata: { consenterEmail, savedDate, itemType=CORRECTION_FORM }} = this;
    const { toBucketFileKey } = BucketItemMetadata;
    const bucket = new BucketItem();
    try {
      const { bucketName:Bucket, region } = bucket;
      let metadata:BucketItemMetadataParms|undefined;

      // Lookup the most recently saved correction form if the metadata is not specific to a single file
      if( ! savedDate) {
        const bimd = new BucketItemMetadata();
        metadata = await bimd.getLatest({ consenterEmail, itemType:CORRECTION_FORM } as BucketItemMetadataParms);
      }
      else {
        metadata = { consenterEmail, savedDate, itemType } as BucketItemMetadataParms;
      }

      // Bail out if metadata could not be determined
      if( ! metadata) {
        return new Uint8Array(); // Return an empty array
      }

      // Get the s3 object key for the specific pdf file
      const Key = toBucketFileKey(metadata);

      // Get the bytes for the specific pdf file out of the bucket.
      const s3 = new S3({ region });
      const output = await s3.getObject({ Bucket, Key });
      const { Body } = output;
      if(Body) {
        return Body.transformToByteArray();
      }
      return new Uint8Array(); // Return an empty array
    }
    catch(e) {
      log(`ConsenterCorrectionFormBucket.get: ${consenterEmail}`);
      throw(e);
    }
  }

  public Delete = async () => {
    const { metadata } =  this;
    const bucket = new BucketItem();
    return bucket.deleteSingleItem(metadata);
  }

  /**
   * Search the bucket for any existing sendable exhibit or disclosure forms for the consenter. 
   * By "sendable" is meant either a form that has not been corrected, or its most recent correction. 
   * If any are found AND they predate any consenter correction forms that can also be found for that 
   * consenter, return the correction forms - they will be included in related disclosure request and 
   * reminder emails.
   * @param consenterEmail 
   * @param pruneRedundantForms 
   * @returns 
   */
  public static getAll = async (consenterEmail:string, createdAfter:Date=new Date(), pruneRedundantForms:boolean=true): Promise<Uint8Array[]> => {
    const { getInstanceForReading } = BucketCorrectionForm;
    const pdfs = [] as Uint8Array[];
    try {
      const inventory = await BucketInventory.getInstance(consenterEmail);
      const correctionForms = inventory.getAllFormsOfType(ItemType.CORRECTION_FORM);
      if(correctionForms.length == 0) {
        return [];
      }

      for(let i=0; i<correctionForms.length; i++) {
        const metadata = correctionForms[i];
        const form = await getInstanceForReading(metadata);
        if(await form.isRedundant(inventory)) {
          if(pruneRedundantForms) {
            log(`Deleting redundant consenter correction form: ${metadata}`);
            await form.Delete();
          }
          continue;
        }
        const { savedDate } = metadata;
        if( savedDate!.getTime() > createdAfter.getTime()) {
          const pdf = await form.get();
          pdfs.push(pdf);
        }
      }

      return pdfs;
    }
    catch(e) {
      log(`ConsenterCorrectionFormBucket.get: ${consenterEmail}`);
      throw(e);
    }    
  }
}




/**
 * RUN MANUALLY: Modify consenter and entityId as necessary.
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/consenting-person/correction/BucketItemCorrectionForm.ts')) {

  const task = 'add' as 'add'|'get'|'get-all';

  (async() => {
    const context:IContext = await require('../../../../../contexts/context.json');
    const { STACK_ID, REGION, TAGS: { Landscape }} = context;
    const prefix = `${STACK_ID}-${Landscape}`;
    process.env.REGION = REGION;
    process.env[ExhibitFormsBucketEnvironmentVariableName] = `${prefix}-exhibit-forms`;

    const oldConsenter = await ConsenterCrud({ email:'cp2@warhen.work' } as Consenter).read() as Consenter;
    const newConsenter = Object.assign({}, oldConsenter);
    newConsenter.email = 'cp1@warhen.work';
    newConsenter.lastname = `${oldConsenter.lastname} (corrected)`;

    switch(task) {
      case "add":
        const form = BucketCorrectionForm.getInstanceForCreation(newConsenter, oldConsenter);
        break;
      case "get":
        log('NOT IMPLEMENTED');
        break;
      case "get-all":
        log('NOT IMPLEMENTED');
        break;
    }
  })();
}