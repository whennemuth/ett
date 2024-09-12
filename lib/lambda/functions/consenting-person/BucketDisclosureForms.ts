import { S3 } from "@aws-sdk/client-s3";
import { DAOFactory } from "../../_lib/dao/dao";
import { Entity, Roles, User, YN } from "../../_lib/dao/entity";
import { DisclosureForm, DisclosureFormData } from "../../_lib/pdf/DisclosureForm";
import { BucketItem } from "./BucketItem";
import { BucketItemMetadata, BucketItemMetadataParms, ItemType } from "./BucketItemMetadata";

export class DisclosureFormBucket {
  private bucket:BucketItem;

  constructor(bucket:BucketItem) {
    this.bucket = bucket;
  }

  public add = async (parms:BucketItemMetadataParms):Promise<string> => {
    try {
      const { DISCLOSURE } = ItemType;
      const { entityId, affiliateEmail, savedDate=new Date()} = parms;
      const { consenter, consenter: { email:consenterEmail, exhibit_forms=[] }, bucketName:Bucket, region } = this.bucket;

      // Get the s3 object key for the single exhibit form pdf to be stored.
      const Key = BucketItemMetadata.toBucketObjectKey({
        itemType:DISCLOSURE, consenterEmail, entityId, affiliateEmail, correction:false, savedDate
      });

      // Instantiate the requesting entity details
      const data = {
        consenter, 
        disclosingEntity: { name: '', representatives: [] },
        requestingEntity: { name: '', authorizedIndividuals: [] }
      } as DisclosureFormData;

      // Populate the name for the requesting entity details
      const daoEntity = DAOFactory.getInstance({ DAOType:"entity", Payload: { entity_id:entityId }});
      const entity = await daoEntity.read() as Entity;
      data.requestingEntity.name = entity.entity_name;

      // Populate the authorized individuals for the requesting entity details
      const daoUser = DAOFactory.getInstance({ DAOType:'user', Payload: { entity_id:entityId }});
      const users = await daoUser.read() as User[];
      const authUsers = users.filter(user => user.active == YN.Yes && (user.role == Roles.RE_AUTH_IND));
      data.requestingEntity.authorizedIndividuals.push(...authUsers);
      

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
      console.log(`DisclosureFormBucket.add: ${JSON.stringify({ bucket:this.bucket, parms }, null, 2)}`);
      throw(e);
    }
  }

  /**
   * Add a corrected disclosure form to the bucket
   * @param entityId 
   * @param affiliate 
   */
  public correct = async (parms:BucketItemMetadataParms) => {
    parms.correction = true;
    await this.add(parms);
  }

  public get = async (parms:BucketItemMetadataParms|string): Promise<Uint8Array> => {
    try {
      const { fromBucketObjectKey, toBucketObjectKey } = BucketItemMetadata;
      if(typeof parms == 'string') {
        // parms is in the form of an s3 object key, so convert it to a metadata object.
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
      console.log(`DisclosureFormBucket.get: ${JSON.stringify({ bucket:this.bucket, parms }, null, 2)}`);
      throw(e);
    }
  }
  
}