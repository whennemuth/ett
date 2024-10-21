import { DeleteObjectCommandOutput, DeleteObjectsCommandOutput, GetObjectTaggingCommand, GetObjectTaggingCommandOutput, ListObjectsV2CommandOutput, ObjectIdentifier, PutObjectTaggingCommand, PutObjectTaggingCommandOutput, S3 } from "@aws-sdk/client-s3";
import { debuglog } from "util";
import { IContext } from "../../../../contexts/IContext";
import { log } from "../../Utils";
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
      console.log(`Cannot delete ${Key} as it does not refer to a single file.`);
      return false;
    }
    const region = process.env.REGION ?? 'us-east-2';
    const s3 = new S3({ region });
    const output = await s3.deleteObject({ Bucket, Key }) as DeleteObjectCommandOutput;
    return output.DeleteMarker ?? true;
  }

  public deleteMultipleItems = async (Objects:ObjectIdentifier[]):Promise<DeleteObjectsCommandOutput> => {
    const { bucketName:Bucket, region } = this;
    const s3 = new S3({ region });
    console.log(`Deleting the following objects from ${this.bucketName}: 
      ${JSON.stringify(Objects, null, 2)}`);
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
  private listObjects = async (parms:BucketItemMetadataParms): Promise<ListObjectsOutput> => {
    const { getPrefix, bucketName:Bucket, region } = this;
    const { affiliateEmail, savedDate } = parms;

    const Prefix = getPrefix(parms);
    console.log(`Listing bucket content under prefix: ${Prefix}`);

    if(affiliateEmail && savedDate) {
      return { Prefix };
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
    return { Prefix, listedObjects };
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
   * Get a list of metadata objects from a query against the s3 bucket. 
   * @param parms 
   * @returns 
   */
  public listMetadata = async (parms:BucketItemMetadataParms): Promise<ListMetadataOutput> => {
    const { listKeys } = this;
    const output = await listKeys(parms);
    const { Prefix, keys } = output;
    const items = keys.map(key => {
      return BucketItemMetadata.fromBucketObjectKey(key);
    });
    return { Prefix, items }
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
      console.log(`Consenter email missing from ${JSON.stringify(metadata, null, 2)}`);
      return;
    }
    if( ! entityId) {
      console.log(`Entity ID missing from ${JSON.stringify(metadata, null, 2)}`);
      return;
    }
    if( ! affiliateEmail) {
      console.log(`Affiliate email missing from ${JSON.stringify(metadata, null, 2)}`);
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
   * @param parms 
   * @param Key The tag key
   * @param Value 
   * @returns 
   */
  public tag = async (parms:BucketItemMetadataParms|string, Key:string, Value:string): Promise<boolean> => {
    console.log(`Tagging item: ${JSON.stringify({ parms, Key, Value }, null, 2)}`);
    try {
      const { bucketName:Bucket, region, getObjectKey } = this;

      // 1) Convert the metadata into an s3ObjectKey that points to a specific pdf file.
      const s3ObjectKey = await getObjectKey(parms);
      if( ! s3ObjectKey) {
        console.error(`Cannot find a pdf file stored in s3 that reflects the specified parameters: ${JSON.stringify(parms, null, 2)}`);
        return false;
      }

      // 2) Configure tagging command
      const putTaggingCommand = new PutObjectTaggingCommand({
        Bucket, Key: s3ObjectKey, Tagging: { TagSet: [ { Key, Value} ] },
      });
      const s3 = new S3({ region });

      // 3) Tag the object in the bucket and log the response
      const response = await s3.send(putTaggingCommand) as PutObjectTaggingCommandOutput;
      console.log(`Tagging complete, response: ${JSON.stringify(response, null, 2)}`);
      return true;
    }
    catch(e) {
      log(e);
      return false;
    }
  }

  /**
   * Retrieve the value of a specified tag of an object, specified by key, in the specified bucket.
   * @param parms 
   * @param Key The tag key
   * @returns 
   */
  public getTag = async (parms:BucketItemMetadataParms|string, Key:string): Promise<string|undefined> => {
    console.log(`Getting tag for item: ${JSON.stringify({ parms, Key }, null, 2)}`);
    try {
      const { bucketName:Bucket, region, getObjectKey } = this;

      // 1) Convert the metadata into an s3ObjectKey that points to a specific pdf file.
      const s3ObjectKey = await getObjectKey(parms);
      if( ! s3ObjectKey) {
        console.error(`Cannot find a pdf file stored in s3 that reflects the specified parameters: ${JSON.stringify(parms, null, 2)}`);
        return;
      }

      // 2) Configure tagging command
      const getTaggingCommand = new GetObjectTaggingCommand({
        Bucket, Key: s3ObjectKey
      });
      const s3 = new S3({ region });
      const response = await s3.send(getTaggingCommand) as GetObjectTaggingCommandOutput;
      debuglog(`Tagging lookup response: ${JSON.stringify(response, null, 2)}`);
      const tag = (response.TagSet ?? []).find(tag => {
        return tag.Key == Key;
      })
      if(tag) {
        console.log(`Tag found, value: ${tag.Value}`);
        return tag.Value;
      }
      else {
        console.log('Tag not found');
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
if(args.length > 3 && args[2] == 'RUN_MANUALLY_BUCKET_ITEM') {

  const task = args[3] as 'list'|'tags';

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
        console.log(JSON.stringify(output, null, 2));
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
              console.log(`${Key}, ${Tags.DISCLOSED}: ${tagValue}`);
              tagFound = true;
              break; // Only report the first key found
            }
          }
        }
        if( ! tagFound) {
          console.log(`Cannot find any tagged objects to match provided metadata!`);
        }
        console.log('Done.');
        break;
    }
  })();
}