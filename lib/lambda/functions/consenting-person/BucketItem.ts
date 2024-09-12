import { DeleteObjectsCommandOutput, ListObjectsV2CommandOutput, ObjectIdentifier, S3 } from "@aws-sdk/client-s3";
import { Consenter } from "../../_lib/dao/entity";
import { BucketItemMetadata, BucketItemMetadataParms } from "./BucketItemMetadata";

export type ListObjectsOutput = {
  Prefix:string, listedObjects:ListObjectsV2CommandOutput
}

export class BucketItem {
  bucketName:string|undefined;
  consenter: Consenter;
  region:string

  constructor(consenter:Consenter, bucketName?:string) {
    this.consenter = consenter;
    this.bucketName = bucketName ?? process.env.EXHIBIT_FORMS_BUCKET_NAME;
    this.region = process.env.REGION ?? 'us-east-2';
  }

  public deleteMultipleItems = async (Objects:ObjectIdentifier[]):Promise<DeleteObjectsCommandOutput> => {
    const { bucketName:Bucket, region } = this;
    const s3 = new S3({ region });
    console.log(`Deleting the following objects from ${this.bucketName}: 
      ${JSON.stringify(Objects, null, 2)}`);
    return await s3.deleteObjects({ Bucket, Delete: { Objects }});
  }


  public listObjects = async (parms:BucketItemMetadataParms): Promise<ListObjectsOutput> => {
    const { bucketName:Bucket, consenter: { email:consenterEmail }, region, deleteMultipleItems } = this;
    const { itemType, entityId, affiliateEmail, correction=false, savedDate } = parms;

    // Get the prefix that identifies the directory for the entity.
    let Prefix = BucketItemMetadata.toBucketObjectKey({
      itemType, consenterEmail, affiliateEmail, entityId, correction, savedDate
    });

    // If no specific file is indicated, trim off the ending that was built into the object key as a default.
    if( ! savedDate) {
      Prefix = Prefix.substring(0, Prefix.lastIndexOf('/') + 1);
    }
    
    // List all objects in the specified folder, and return if there are none.
    const s3 = new S3({ region });
    const listedObjects = await s3.listObjectsV2({ Bucket, Prefix });
    return { Prefix, listedObjects };
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
      const { fromBucketObjectKey, toBucketObjectKey } = BucketItemMetadata;
      if(typeof parms == 'string') {
        // metadata is in the form of an s3 object key, so convert it to a metadata object.
        parms = fromBucketObjectKey(parms);
      }
  
      // 1) Get the metadata to be used to identity a specific pdf file
      const { bucketName:Bucket, region, consenter: { email:consenterEmail } } = this;
      const bimd = new BucketItemMetadata(this);
      const singleMetadata = await bimd.getLatest(parms);
      if( ! singleMetadata) {
        return new Uint8Array(); // Return an empty array
      }
  
      // 2) Convert the metadata into an s3ObjectKey that points to a specific pdf file.
      const s3ObjectKey = toBucketObjectKey(Object.assign({ consenterEmail }, singleMetadata));
  
      // 3) Get the bytes for the specific pdf file out of the bucket.
      const s3 = new S3({ region });
      const output = await s3.getObject({ Bucket, Key:s3ObjectKey });
      const { Body } = output;
      if(Body) {
        return Body.transformToByteArray();
      }
      return new Uint8Array(); // Return an empty array
    }
  
}