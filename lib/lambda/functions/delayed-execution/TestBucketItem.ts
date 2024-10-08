import { IContext } from "../../../../contexts/IContext";
import { AffiliateTypes, Consenter, YN } from "../../_lib/dao/entity"
import { DisclosureFormBucket } from "../consenting-person/BucketDisclosureForms";
import { ExhibitBucket } from "../consenting-person/BucketExhibitForms";
import { BucketItem } from "../consenting-person/BucketItem";
import { ExhibitFormsBucketEnvironmentVariableName, ItemType } from "../consenting-person/BucketItemMetadata";
import { v4 as uuidv4 } from 'uuid';

export const getConsenter = (dummyDate:string) => {
  return {
    email: 'cp1@warhen.work',
    active: YN.Yes,
    consented_timestamp: [ dummyDate ],
    create_timestamp: dummyDate,
    firstname: 'Mickey',
    lastname: 'Mouse',
    middlename: 'M',
    sub: uuidv4(),
    phone_number: '508-222-6666',
    title: 'Cartoon Character',
    exhibit_forms: [{
      entity_id: '961adc5c-3428-4b63-9c9b-e2434e66f03a',
      create_timestamp: dummyDate,
      sent_timestamp: dummyDate,
      affiliates: [{
        affiliateType: AffiliateTypes.ACADEMIC,
        email: 'affiliate1@warhen.work',
        fullname: 'Wile E Coyote',
        org: 'Warner Bros Inc.',
        phone_number: '800-222-3333',
        title: 'Inventor'
      }]
    }]
  } as Consenter;
}

export const getTestItem = async () => {
  const now = new Date();
  const dummyDate = new Date().toISOString();
  const consenter = getConsenter(dummyDate);
  const { EXHIBIT, DISCLOSURE } = ItemType;
  const context:IContext = await require('../../../../contexts/context.json');
  const { STACK_ID, REGION, TAGS: { Landscape } } = context;
  const prefix = `${STACK_ID}-${Landscape}`;
  const bucketName = `${prefix}-exhibit-forms`;
  process.env[ExhibitFormsBucketEnvironmentVariableName] = bucketName;
  process.env.PREFIX = prefix;
  process.env.REGION = REGION;


  /**
   * Put a single exhibit or disclosure form in the bucket
   * @returns The s3 object key of the added form.
   */
  const loadFormIntoBucket = async (itemType:ItemType):Promise<string> => {
    const { entity_id:entityId, affiliates=[] } = consenter.exhibit_forms![0];
    const affiliateEmail = affiliates[0].email;
    let bucket:ExhibitBucket|DisclosureFormBucket;
    switch(itemType) {
      case EXHIBIT:
        bucket = new ExhibitBucket(new BucketItem(consenter));
        return bucket.add({ itemType:EXHIBIT, entityId, affiliateEmail, savedDate:now });      
      case DISCLOSURE:
        bucket = new DisclosureFormBucket(new BucketItem(consenter));
        return bucket.add({ itemType:DISCLOSURE, entityId, affiliateEmail, savedDate:now });
      }      
  }

  return { loadFormIntoBucket, consenter };
}