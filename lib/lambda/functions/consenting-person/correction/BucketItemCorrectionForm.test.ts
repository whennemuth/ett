import { BucketCorrectionForm } from "./BucketItemCorrectionForm";
import { BucketInventory } from "../BucketInventory";
import { BucketItemMetadataParms, ItemType } from "../BucketItemMetadata";

const day = 1000 * 60 * 60 * 24;
const baseDate = new Date();
const daysAgo = ((days:number) => { return new Date(baseDate.getTime() - (day * days)); });
const daysAhead = ((days:number) => { return new Date(baseDate.getTime() + (day * days)); });

jest.spyOn(BucketInventory, 'getInstance').mockImplementation(async (consenterEmail:string, entityId?:string) => {
  const instance = new BucketInventory(consenterEmail, entityId);
  const { CORRECTION_FORM, DISCLOSURE, EXHIBIT } = ItemType;
  const contents = [] as BucketItemMetadataParms[];
  switch(consenterEmail) {
    case 'bugs@warnerbros.com': 
      contents.push({ consenterEmail, entityId: 'entity_id1', affiliateEmail: 'email1', itemType:EXHIBIT, savedDate:daysAgo(1) });
      contents.push({ consenterEmail, entityId: 'entity_id2', affiliateEmail: 'email2', itemType:DISCLOSURE, savedDate:daysAgo(2) });
      contents.push({ consenterEmail, itemType:CORRECTION_FORM, savedDate:daysAgo(1) } as BucketItemMetadataParms);
      break;
    case 'daffy@warnerbros.com':
      contents.push({ consenterEmail, entityId: 'entity_id1', affiliateEmail: 'email1', itemType:EXHIBIT, savedDate:daysAgo(1) });
      contents.push({ consenterEmail, entityId: 'entity_id2', affiliateEmail: 'email2', itemType:DISCLOSURE, savedDate:daysAgo(2) });
      contents.push({ consenterEmail, itemType:CORRECTION_FORM, savedDate:daysAgo(1) } as BucketItemMetadataParms);
      contents.push({ consenterEmail, entityId: 'entity_id1', affiliateEmail: 'email2', itemType:EXHIBIT, savedDate:daysAhead(1)});
      contents.push({ consenterEmail, entityId: 'entity_id2', affiliateEmail: 'email3', itemType:DISCLOSURE, savedDate:daysAhead(2)});
      break;
    case 'foghorn@warnerbros.com':
      contents.push({ consenterEmail, itemType:CORRECTION_FORM, savedDate:daysAgo(1) } as BucketItemMetadataParms);
      contents.push({ consenterEmail, entityId: 'entity_id1', affiliateEmail: 'email2', itemType:EXHIBIT, savedDate:daysAhead(1)});
      contents.push({ consenterEmail, entityId: 'entity_id2', affiliateEmail: 'email3', itemType:DISCLOSURE, savedDate:daysAhead(2)});
      break;
    case 'yosemite@warnerbros.com':
      break;    
  }
  (instance as any)['contents'] = contents;
  return instance;
});

describe('BucketCorrectionForm.isRedundant', () => {

  it('Should properly recognize a redundant correction form - 1', async () => {
    const form = await BucketCorrectionForm.getInstanceForReading({
      consenterEmail: 'bugs@warnerbros.com',
      savedDate: baseDate
    } as BucketItemMetadataParms);
    expect(await form.isRedundant()).toEqual(false);
  });

  it('Should properly recognize a redundant correction form - 2', async () => {
    const form = await BucketCorrectionForm.getInstanceForReading({
      consenterEmail: 'daffy@warnerbros.com',
      savedDate: baseDate
    } as BucketItemMetadataParms);
    expect(await form.isRedundant()).toEqual(false);
  });

  it('Should properly recognize a redundant correction form - 3', async () => {
    const form = await BucketCorrectionForm.getInstanceForReading({
      consenterEmail: 'foghorn@warnerbros.com',
      savedDate: baseDate
    } as BucketItemMetadataParms);
    expect(await form.isRedundant()).toEqual(true);
  });

  it('Should properly recognize a redundant correction form - 4', async () => {
    const form = await BucketCorrectionForm.getInstanceForReading({
      consenterEmail: 'yosemiten@warnerbros.com',
      savedDate: baseDate
    } as BucketItemMetadataParms);
    expect(await form.isRedundant()).toEqual(true);
  });
});