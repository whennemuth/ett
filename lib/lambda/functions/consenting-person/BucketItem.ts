import { DeleteObjectCommandOutput, DeleteObjectsCommandOutput, GetObjectTaggingCommand, GetObjectTaggingCommandOutput, ListObjectsV2CommandOutput, ObjectIdentifier, PutObjectTaggingCommand, PutObjectTaggingCommandOutput, S3 } from "@aws-sdk/client-s3";
import { IContext } from "../../../../contexts/IContext";
import { debugLog, log } from "../../Utils";
import { BucketItemMetadata, BucketItemMetadataParms, ExhibitFormsBucketEnvironmentVariableName, ItemType } from "./BucketItemMetadata";

export type DisclosureItemsParms = {
  consenterEmail:string;
  s3ObjectKeyForDisclosureForm:string;
  s3ObjectKeyForExhibitForm:string;
}
type ListObjectsOutput = {
  Prefix:string, listedObjects?:ListObjectsV2CommandOutput
}
export type ListKeysOutput = {
  Prefix:string, keys:string[]
}
export type ListMetadataOutput = {
  Prefix:string, items:BucketItemMetadataParms[]
}
export enum Tags {
  DISCLOSED = 'DisclosureRequestSentTimestamp'
} 

/**
 * This class represents the exhibit forms s3 bucket as a set of shared utilities that can be applied to it for 
 * querying, deleting, and tagging any of those types of items that can be put in it within the scope of a 
 * specified consenting individual subdirectory
 */
export class BucketItem {
  bucketName:string|undefined;
  region:string

  constructor(bucketName?:string) {
    this.bucketName = bucketName ?? process.env[ExhibitFormsBucketEnvironmentVariableName];
    this.region = process.env.REGION ?? 'us-east-2';
  }


  /**
   * Delete a single exhibit form from the bucket
   * @returns 
   */
  public deleteSingleItem = async (metadata: BucketItemMetadataParms|string):Promise<boolean> => {
    const { toBucketFileKey: toBucketFileKey } = BucketItemMetadata;
    const { bucketName:Bucket } = this;
    let Key:string;
    if(typeof metadata == 'string') {
      Key = metadata;
    }
    else {
      Key = toBucketFileKey(metadata);
    }

    if( ! Key || Key.toLowerCase().endsWith('.pdf') == false) {
      log(`Cannot delete ${Key} as it does not refer to a single file.`);
      return false;
    }
    const region = process.env.REGION ?? 'us-east-2';
    const s3 = new S3({ region });
    const output = await s3.deleteObject({ Bucket, Key }) as DeleteObjectCommandOutput;
    return output.DeleteMarker ?? true;
  }

  public deleteMultipleItems = async (Objects:ObjectIdentifier[]):Promise<DeleteObjectsCommandOutput> => {
    if((Objects ?? []).length == 0) {
      log(`No objects specified for deletion from ${this.bucketName}`);
      return { $metadata: { httpStatusCode: 200 }} as DeleteObjectsCommandOutput;
    }
    const { bucketName:Bucket, region } = this;
    const s3 = new S3({ region });
    log(Objects, `Deleting the following objects from ${this.bucketName}`);
    return await s3.deleteObjects({ Bucket, Delete: { Objects }});
  }

  private getPrefix = (parms:BucketItemMetadataParms):string => {
    const { consenterEmail, itemType, entityId, affiliateEmail, correction=false, savedDate } = parms;

    // Get the prefix that identifies the directory for the entity.
    let Prefix = BucketItemMetadata.toBucketFolderKey({
      itemType, consenterEmail, affiliateEmail, entityId, correction, savedDate
    });

    return Prefix.endsWith('/') ? Prefix : `${Prefix}/`;
  }

  /**
   * Get a list of pdf forms from a query against the s3 bucket. Matches are those s3 objects
   * whose keys reflect the parms. Parameters that are specific to the saved date will always 
   * return just one item, while parms specific only to the consenter email may return many items. 
   * @param parms 
   * @returns 
   */
  private listObjects = async (parms?:BucketItemMetadataParms): Promise<ListObjectsOutput> => {
    const { getPrefix, bucketName:Bucket, region } = this;

    let Prefix:string|undefined;
    if(parms) {
      const { affiliateEmail, savedDate } = parms;

      Prefix = getPrefix(parms);
      log(`Listing bucket content under prefix: ${Prefix}`);

      if(affiliateEmail && savedDate) {
        return { Prefix };
      }
    }
    else {
      log('Listing entire bucket content');
    }
    
    // List all objects in the specified folder, and return if there are none.
    const s3 = new S3({ region });
    let isTruncated = true;
    let ContinuationToken: string | undefined = undefined;
    let totalContents = [] as Object[];

    const getChunk = async () => {
      const list = await s3.listObjectsV2({ Bucket, Prefix, ContinuationToken });
      isTruncated = list.IsTruncated || false;
      ContinuationToken = list.NextContinuationToken;
      totalContents.push(...(list.Contents ?? []));
      return list;
    }

    let listedObjects:ListObjectsV2CommandOutput = await getChunk();

    while(isTruncated) {
      listedObjects = await getChunk();
    }

    listedObjects.Contents = totalContents;
    return { Prefix:(Prefix ?? '/'), listedObjects };
  }

  /**
   * Get a list of s3 objects keys from a query against the s3 bucket.
   * @param parms 
   * @returns 
   */
  public listKeys = async (parms:BucketItemMetadataParms): Promise<ListKeysOutput> => {
    const { listObjects, getPrefix } = this;
    const { toBucketFileKey } = BucketItemMetadata;
    const { itemType, savedDate } = parms;

    if(itemType && savedDate) {
      // The metadata parameter is specific to a single object
      return { Prefix:getPrefix(parms), keys: [ toBucketFileKey(parms) ] };
    }

    const output:ListObjectsOutput = await listObjects(parms);

    const { Prefix, listedObjects } = output;
    const { Contents } = listedObjects ?? {};
    if( ! Contents || Contents.length === 0) {
      return { Prefix:getPrefix(parms), keys:[] };
    }
    const keys = Contents.map(s3Object => {
      const { Key } = s3Object;
      return Key ? Key : undefined;
    }).filter(metadata => { return metadata != undefined; }) as string[];

    return { Prefix, keys };
  }

  /**
   * List every object key in the bucket.
   * @returns 
   */
  public listAllKeys = async (): Promise<string[]> => {
    const { listObjects } = this;
    const output:ListObjectsOutput = await listObjects();
    const { listedObjects } = output;
    const { Contents } = listedObjects ?? {};
    if( ! Contents || Contents.length === 0) {
      return [];
    }
    return Contents.map(s3Object => {
      const { Key } = s3Object;
      return Key ? Key : undefined;
    }).filter(metadata => { return metadata != undefined; }) as string[];
  }

  /**
   * Get a list of metadata objects from a query against the s3 bucket. 
   * @param parms 
   * @returns 
   */
  public listMetadata = async (parms?:BucketItemMetadataParms): Promise<ListMetadataOutput> => {
    const { listKeys, listAllKeys } = this;
    let items = [] as BucketItemMetadataParms[];
    if(parms) {
      const output = await listKeys(parms);
      const { Prefix, keys } = output;
      items = keys.map(key => {
        return BucketItemMetadata.fromBucketObjectKey(key);
      });
      return { Prefix, items }
    }
    else {
      const keys = await listAllKeys();
      items = keys.map(key => {
        return BucketItemMetadata.fromBucketObjectKey(key);
      }); 
      return { Prefix:'/', items };     
    }

  }

  /**
   * Get the key of a specific s3 object that reflects the specified metadata parameters.
   * @returns 
   */
  public getObjectKey = async (metadata:BucketItemMetadataParms|string): Promise<string|void> => {
    const { fromBucketObjectKey, toBucketFileKey: toBucketFileKey } = BucketItemMetadata;
    if(typeof metadata == 'string') {
      // metadata is in the form of an s3 object key, so convert it to a metadata object.
      metadata = fromBucketObjectKey(metadata);
    }

    let { consenterEmail, entityId, affiliateEmail, savedDate } = metadata;    
    if( ! consenterEmail) {
      log(metadata, `Consenter email missing from`);
      return;
    }
    if( ! entityId) {
      log(metadata, `Entity ID missing from`);
      return;
    }
    if( ! affiliateEmail) {
      log(metadata, `Affiliate email missing from`);
      return;
    }
    if(savedDate) {
      // metadata is already complete enough to indicate a single file, so flatten it and retun it.
      return toBucketFileKey(Object.assign({ consenterEmail }, metadata));
    }

    // 1) Get the metadata to be used to identity a specific pdf file
    const bimd = new BucketItemMetadata();
    const singleMetadata = await bimd.getLatest(metadata);
    if( ! singleMetadata) {
      return undefined;
    }

    // 2) Return s3ObjectKey converted from the metadata parameters that points to a specific pdf file.
    return toBucketFileKey(Object.assign({ consenterEmail }, singleMetadata));
  }

  /**
   * Get the bytes for a specific pdf file from s3 as identified by the supplied metadata.
   * @param metadata Will usually be specific enough to identify a specific object in s3, but may indicate
   * the original form AND all of its corrections. If the latter is the case, the bytes of the
   * most recent corrected pdf file are returned.
   * @returns 
   */
  public getObjectBytes = async (metadata:BucketItemMetadataParms): Promise<Uint8Array> => {
    const { toBucketFileKey } = BucketItemMetadata;
    const { consenterEmail } = metadata;

    // 1) Get the metadata to be used to identity a specific pdf file
    const { bucketName:Bucket, region } = this;
    const bimd = new BucketItemMetadata();
    const singleParms = await bimd.getLatest(metadata);
    if( ! singleParms) {
      return new Uint8Array(); // Return an empty array
    }

    // 2) Convert the metadata into an s3ObjectKey that points to a specific pdf file.
    const s3ObjectKey = toBucketFileKey(Object.assign({ consenterEmail }, singleParms));

    // 3) Get the bytes for the specific pdf file out of the bucket.
    const s3 = new S3({ region });
    const output = await s3.getObject({ Bucket, Key:s3ObjectKey });
    const { Body } = output;
    if(Body) {
      return Body.transformToByteArray();
    }
    return new Uint8Array(); // Return an empty array
  }

  /**
   * Apply a tag with the specified name and value to the specified bucket object identified by key.
   * @param metadata 
   * @param Key The tag key
   * @param Value 
   * @returns 
   */
  public tag = async (metadata:BucketItemMetadataParms|string, Key:string, Value:string): Promise<boolean> => {
    log({ parms: metadata, Key, Value },`Tagging item`);
    try {
      const { bucketName:Bucket, region, getObjectKey } = this;

      // 1) Convert the metadata into an s3ObjectKey that points to a specific pdf file.
      const s3ObjectKey = await getObjectKey(metadata);
      if( ! s3ObjectKey) {
        log(metadata, `ERROR: Cannot find a pdf file stored in s3 that reflects the specified parameters`);
        return false;
      }

      // 2) Configure tagging command
      const putTaggingCommand = new PutObjectTaggingCommand({
        Bucket, Key: s3ObjectKey, Tagging: { TagSet: [ { Key, Value} ] },
      });
      const s3 = new S3({ region });

      // 3) Tag the object in the bucket and log the response
      const response = await s3.send(putTaggingCommand) as PutObjectTaggingCommandOutput;
      log(response, `Tagging complete, response`);
      return true;
    }
    catch(e) {
      log(e);
      return false;
    }
  }

  /**
   * Retrieve the value of a specified tag of an object, specified by key, in the specified bucket.
   * @param metadata 
   * @param Key The tag key
   * @returns 
   */
  public getTag = async (metadata:BucketItemMetadataParms|string, Key:string): Promise<string|undefined> => {
    log({ parms: metadata, Key }, `Getting tag for item`);
    try {
      const { bucketName:Bucket, region, getObjectKey } = this;

      // 1) Convert the metadata into an s3ObjectKey that points to a specific pdf file.
      const s3ObjectKey = await getObjectKey(metadata);
      if( ! s3ObjectKey) {
        log(metadata, 'ERROR: Cannot find a pdf file stored in s3 that reflects the specified parameters');
        return;
      }

      // 2) Configure tagging command
      const getTaggingCommand = new GetObjectTaggingCommand({
        Bucket, Key: s3ObjectKey
      });
      const s3 = new S3({ region });
      const response = await s3.send(getTaggingCommand) as GetObjectTaggingCommandOutput;
      debugLog(response, `Tagging lookup response`);
      const tag = (response.TagSet ?? []).find(tag => {
        return tag.Key == Key;
      })
      if(tag) {
        log(`Tag found, value: ${tag.Value}`);
        return tag.Value;
      }
      else {
        log('Tag not found');
      }
      return;
    }
    catch(e) {
      log(e);
      return;
    }
  }
}




/**
 * RUN MANUALLY: Modify consenter and entityId as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/consenting-person/BucketItem.ts')) {

  const task = 'tags' as 'list'|'tags';

  (async() => {
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, REGION, TAGS: { Landscape } } = context;
    const prefix = `${STACK_ID}-${Landscape}`;
    const bucketName = `${prefix}-exhibit-forms`;
    process.env[ExhibitFormsBucketEnvironmentVariableName] = bucketName;
    process.env.REGION = REGION;
    let bucketItem:BucketItem;
    let output:any;

    switch(task) {
      case "list":
        bucketItem = new BucketItem();
        output = await bucketItem.listMetadata({
          consenterEmail: 'cp3@warhen.work',
          entityId: 'eea2d463-2eab-4304-b2cf-cf03cf57dfaa',
          itemType: ItemType.EXHIBIT,
        } as BucketItemMetadataParms);
        log(output);
        break;
      case "tags":
        bucketItem = new BucketItem();
        output = await bucketItem.listKeys({
          consenterEmail: 'cp2@warhen.work',
          entityId: '13376a3d-12d8-40e1-8dee-8c3d099da1b2',
          itemType: ItemType.EXHIBIT,
          affiliateEmail: 'affiliate1@warhen.work'
        } as BucketItemMetadataParms);
        const { keys } = output;
        let tagFound = false;
        if( keys.length > 0) {
          for(let i=0; i<keys.length; i++) {
            const Key = keys[i]
            const tagValue = await bucketItem.getTag(Key, Tags.DISCLOSED);
            if(tagValue) {
              log(`${Key}, ${Tags.DISCLOSED}: ${tagValue}`);
              tagFound = true;
              break; // Only report the first key found
            }
          }
        }
        if( ! tagFound) {
          log(`Cannot find any tagged objects to match provided metadata!`);
        }
        log('Done.');
        break;
    }
  })();
}