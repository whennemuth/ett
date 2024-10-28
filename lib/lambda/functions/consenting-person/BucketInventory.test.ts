import { BucketInventory } from "./BucketInventory";
import { ListKeysOutput } from "./BucketItem";
import { BucketItemMetadata, BucketItemMetadataParms, ItemType } from "./BucketItemMetadata";

const { CORRECTION_FORM, EXHIBIT, DISCLOSURE } = ItemType;
const day = 1000 * 60 * 60 * 24;
const baseDate = new Date();
const daysAgo = ((days:number) => { return new Date(baseDate.getTime() - (day * days)); });
const daysAhead = ((days:number) => { return new Date(baseDate.getTime() + (day * days)); });
const bugs = 'bunny@warnerbros.com';
const daffy = 'duck@warnerbros.com';
const foghorn = 'leghorn@warnerbros.com';
const sam = 'yosemite@warnerbros.com';
const aff1 = 'aff1@affiliates.org';
const aff2 = 'aff2@affiliates.org';
const aff3 = 'aff3@affiliates.org';

const getMockKey = (unparsed:string) => {
  const parts = unparsed.split('|');
  const metadata = { 
    consenterEmail:parts[0],
    entityId:parts[1],
    affiliateEmail:parts[2],
    correction:parts[3]=='true',
    itemType:parts[4],
    savedDate:daysAhead(parseInt(parts[5]))
  } as BucketItemMetadataParms;
  return BucketItemMetadata.toBucketFileKey(metadata);
}

jest.mock('./BucketItem.ts', () => {
  return {
    BucketItem: jest.fn().mockImplementation(() => { 
      return {        
        listKeys: async (metadata:BucketItemMetadataParms): Promise<ListKeysOutput> => {
          const { toBucketFolderKey } = BucketItemMetadata;
          const { consenterEmail } = metadata;
          const keys = [] as string[]
          switch(consenterEmail) {
            case bugs:
              break;
            case daffy:
              keys.push(getMockKey(`${daffy}|entity1|${aff1}|false|${EXHIBIT}|0`));
              break;
            case foghorn:
              keys.push(getMockKey(`${daffy}|entity1|${aff1}|false|${EXHIBIT}|0`));
              keys.push(getMockKey(`${daffy}|entity1|${aff1}|true|${EXHIBIT}|1`));
              keys.push(getMockKey(`${daffy}|entity1|${aff1}|true|${EXHIBIT}|2`));
              break;
            case sam:

              // Mock 3 non-corrected affiliate-specific forms in the same consenter/entity1 directory
              keys.push(getMockKey(`${sam}|entity1|${aff1}|false|${EXHIBIT}|0`));
              keys.push(getMockKey(`${sam}|entity1|${aff2}|false|${EXHIBIT}|0`));
              keys.push(getMockKey(`${sam}|entity1|${aff3}|false|${EXHIBIT}|0`));
              // Mock 2 correction forms for each of the 3 mocked forms above.
              keys.push(getMockKey(`${sam}|entity1|${aff1}|true|${EXHIBIT}|1`));
              keys.push(getMockKey(`${sam}|entity1|${aff1}|true|${EXHIBIT}|2`));
              keys.push(getMockKey(`${sam}|entity1|${aff2}|true|${EXHIBIT}|1`));
              keys.push(getMockKey(`${sam}|entity1|${aff2}|true|${EXHIBIT}|2`));
              keys.push(getMockKey(`${sam}|entity1|${aff3}|true|${EXHIBIT}|1`));
              keys.push(getMockKey(`${sam}|entity1|${aff3}|true|${EXHIBIT}|2`));

              // Mock 3 non-corrected affiliate-specific forms in  consenter/entity2 directory
              keys.push(getMockKey(`${sam}|entity2|${aff1}|false|${EXHIBIT}|0`));
              keys.push(getMockKey(`${sam}|entity2|${aff2}|false|${EXHIBIT}|0`));
              keys.push(getMockKey(`${sam}|entity2|${aff3}|false|${EXHIBIT}|0`));
              // Mock 2 correction forms for each of the 3 mocked forms above.
              keys.push(getMockKey(`${sam}|entity2|${aff1}|true|${EXHIBIT}|1`));
              keys.push(getMockKey(`${sam}|entity2|${aff1}|true|${EXHIBIT}|2`));
              keys.push(getMockKey(`${sam}|entity2|${aff2}|true|${EXHIBIT}|1`));
              keys.push(getMockKey(`${sam}|entity2|${aff2}|true|${EXHIBIT}|2`));
              keys.push(getMockKey(`${sam}|entity2|${aff3}|true|${EXHIBIT}|1`));
              keys.push(getMockKey(`${sam}|entity2|${aff3}|true|${EXHIBIT}|2`));
          }

          return { Prefix:toBucketFolderKey({ consenterEmail } as BucketItemMetadataParms), keys };          
        } 
      }
    })
  }
})


describe('BucketInventory.getAllLatestForms', () => {
  it('Should pick out the youngest of related forms - none', async () => {
    const inventory = await BucketInventory.getInstance(bugs);
    const forms = inventory.getAllLatestForms();
    expect(forms.length).toEqual(0);
  });

  it('Should pick out the youngest of related forms - single', async () => {
    const inventory = await BucketInventory.getInstance(daffy);
    const forms = inventory.getAllLatestForms();
    expect(forms.length).toEqual(1);
    expect(forms[0].savedDate?.getTime()).toEqual(baseDate.getTime());
  });


  it('Should pick out the youngest of related forms - basic', async () => {
    const inventory = await BucketInventory.getInstance(foghorn);
    const forms = inventory.getAllLatestForms();
    expect(forms.length).toEqual(1);
    expect(forms[0].savedDate?.getTime()).toEqual(daysAhead(2).getTime());
  });

  it('Should pick out the youngest of related forms - mixture', async () => {
    const inventory = await BucketInventory.getInstance(sam);
    const forms = inventory.getAllLatestForms();
    expect(forms.length).toEqual(6);

    // None of the results should have savedDates whose values are not 2 days out from the base date
    let unexpectedItem = forms.find(metadata => {
      return metadata.savedDate!.getTime() != daysAhead(2).getTime()
    });
    expect(unexpectedItem).toBeUndefined();

    // None of the results should be other than exhibit forms
    unexpectedItem = forms.find(metadata => {
      return metadata.itemType != EXHIBIT
    });
    expect(unexpectedItem).toBeUndefined();

    // Expect each of the 6 "youngest" forms to comprise the results.
    expect(forms.find(m => m.entityId=='entity1' && m.affiliateEmail==aff1)).toBeDefined();
    expect(forms.find(m => m.entityId=='entity1' && m.affiliateEmail==aff2)).toBeDefined();
    expect(forms.find(m => m.entityId=='entity1' && m.affiliateEmail==aff3)).toBeDefined();
    expect(forms.find(m => m.entityId=='entity2' && m.affiliateEmail==aff1)).toBeDefined();
    expect(forms.find(m => m.entityId=='entity2' && m.affiliateEmail==aff2)).toBeDefined();
    expect(forms.find(m => m.entityId=='entity2' && m.affiliateEmail==aff3)).toBeDefined();
  })
})