import { S3 } from "@aws-sdk/client-s3";
import { DAOFactory } from "../../_lib/dao/dao";
import { Entity, Roles, User, YN } from "../../_lib/dao/entity";
import { DisclosureForm, DisclosureFormData } from "../../_lib/pdf/DisclosureForm";
import { BucketItem, Tags } from "./BucketItem";
import { BucketItemMetadata, BucketItemMetadataParms, ItemType } from "./BucketItemMetadata";

export type BucketDisclosureFormParms = {
  metadata:BucketItemMetadataParms|string,
  bucket:BucketItem,
  requestingEntity?:Entity,
  requestingEntityAuthorizedIndividuals?:User[]
};

/**
 * This class represents a single disclosure form within the exhibits s3 bucket.
 */
export class BucketDisclosureForm {
  private metadata:BucketItemMetadataParms;
  private bucket:BucketItem;
  private requestingEntity?:Entity;
  private requestingEntityAuthorizedIndividuals?:User[];

  constructor(parms:BucketDisclosureFormParms) {
    const { bucket, metadata, requestingEntity, requestingEntityAuthorizedIndividuals } = parms;
    const { fromBucketObjectKey } = BucketItemMetadata;

    this.bucket = bucket;
    this.requestingEntity = requestingEntity;
    this.requestingEntityAuthorizedIndividuals = requestingEntityAuthorizedIndividuals;
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
  public add = async (_correction:boolean=false):Promise<string> => {
    const { DISCLOSURE } = ItemType;
    let { metadata, metadata: { 
      entityId, affiliateEmail, correction=_correction, savedDate=new Date() }, 
      requestingEntity, requestingEntityAuthorizedIndividuals,
      bucket: { consenter, consenter: { email:consenterEmail, exhibit_forms=[] }, bucketName:Bucket, region }
    } = this;

    try {
      // Get the s3 object key for the single disclosure form pdf to be stored.
      const Key = BucketItemMetadata.toBucketFileKey({
        itemType:DISCLOSURE, consenterEmail, entityId, affiliateEmail, correction, savedDate
      });

      // Instantiate the requesting entity details
      const data = {
        consenter, 
        disclosingEntity: { name: '', representatives: [] },
        requestingEntity: { name: '', authorizedIndividuals: [] }
      } as DisclosureFormData;

      // Populate the name for the requesting entity details
      if( ! requestingEntity) {
        const daoEntity = DAOFactory.getInstance({ DAOType:"entity", Payload: { entity_id:entityId }});
        requestingEntity = await daoEntity.read() as Entity;
      }
      data.requestingEntity.name = requestingEntity.entity_name;

      // Populate the authorized individuals for the requesting entity details
      if( ! requestingEntityAuthorizedIndividuals) {
        const daoUser = DAOFactory.getInstance({ DAOType:'user', Payload: { entity_id:entityId }});
        const users = await daoUser.read() as User[];
        requestingEntityAuthorizedIndividuals = users.filter(user => user.active == YN.Yes && (user.role == Roles.RE_AUTH_IND));
      }
      data.requestingEntity.authorizedIndividuals.push(...requestingEntityAuthorizedIndividuals);
      

      // Populate the disclosing entity details
      //------------------------------------------
      // TODO: filter affilates (representatives) down to those that share the same specified enity name.
      // This means passing in an additional parameter to for the entity name. For now disclosure forms are
      // displaying EVERY affiliate and using the entity name of the last one of them, which needs to be 
      // fixed. Ask the client what they want to do about the situation where an exhibit form contains two 
      // affiliates from the same organization, but the user varied slightly how the organization is 
      // spelled (ie: "Boston University" vs. "Boston Univ.") - cannot group these into the same disclosure 
      // form because there is no way to tell these refer to the same entity.
      exhibit_forms.forEach(ef => {
        if(ef.entity_id == entityId) {
          (ef.affiliates ?? []).forEach(aff => {
            const { org, email, fullname, phone_number, title } = aff;
            if( email == affiliateEmail) {
              data.disclosingEntity.name = org;          
              data.disclosingEntity.representatives.push({
                email, fullname, phone_number, title
              } as User)
            }
          })
        }
      });
      
      // Create a new disclosure form pdf file
      const pdf = new DisclosureForm(data);

      // Save the new single exhibit form pdf file to the s3 bucket
      const s3 = new S3({ region });
      const Body = await pdf.getBytes();
      console.log(`Adding ${Key}`);
      await s3.putObject({ Bucket, Key, Body, ContentType: 'application/pdf' });

      // Return the object key of the exhibit form.
      return Key;
    }
    catch(e) {
      console.log(`DisclosureFormBucket.add: ${JSON.stringify(metadata, null, 2)}`);
      throw(e);
    }
  }

  /**
   * Add a corrected disclosure form to the bucket
   */
  public correct = async ():Promise<string> => {
    return this.add(true);
  }

  /**
   * Get the bytes for a specific disclosure form pdf file from s3 as identified by the supplied metadata.
   * @returns 
   */
  public get = async (): Promise<Uint8Array> => {
    let { metadata, bucket } = this;
    try {
      return bucket.getObjectBytes(metadata);
    }
    catch(e) {
      console.log(`DisclosureFormBucket.get: ${JSON.stringify({ bucket, metadata }, null, 2)}`);
      throw(e);
    }
  }

  /**
   * Delete a single disclosure form from the bucket
   * @returns 
   */
  public delete = async ():Promise<boolean> => {
    const { bucket, metadata } =  this;
    return bucket.deleteSingleItem(metadata);
  }

  /**
   * Apply a tag to a disclosure form in the bucket to mark it has already gone out in a disclosure request email.
   * @param date 
   * @returns 
   */
  public tagWithDiclosureRequestSentDate = async (date:string=new Date().toISOString()): Promise<boolean> => {
    const { bucket, metadata } = this;
    return bucket.tag(metadata, Tags.DISCLOSED, date);
  }

  /**
   * Determine if a disclosure form in the bucket has already gone out in a disclosure request email.
   * @returns 
   */
  public wasDisclosureRequestSent = async (): Promise<string|undefined> => {
    const { bucket, metadata } = this;
    return bucket.getTag(metadata, Tags.DISCLOSED);
  }
}