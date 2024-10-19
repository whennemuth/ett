import { v4 as uuidv4 } from 'uuid';
import { IContext } from "../../../../contexts/IContext";
import { AffiliateTypes, Consenter, YN } from "../../_lib/dao/entity";
import { BucketItem } from "../consenting-person/BucketItem";
import { BucketDisclosureForm } from "../consenting-person/BucketItemDisclosureForm";
import { BucketExhibitForm } from "../consenting-person/BucketItemExhibitForm";
import { ExhibitFormsBucketEnvironmentVariableName, ItemType } from "../consenting-person/BucketItemMetadata";

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
    switch(itemType) {
      case EXHIBIT:
        return await new BucketExhibitForm(
          new BucketItem(consenter),
          { itemType:EXHIBIT, entityId, affiliateEmail, savedDate:now }
        ).add();
      case DISCLOSURE:
        return await new BucketDisclosureForm({
          bucket: new BucketItem(consenter),
          metadata: { itemType:DISCLOSURE, entityId, affiliateEmail, savedDate:now }
        }).add();
      }      
  }

  return { loadFormIntoBucket, consenter };
}