import { BucketInventory, HierarchicalStructure } from "./BucketInventory";
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
});

describe('BucketInventory.unflattenBucketItems', () => {
  it('Should convert to a hierarchical structure correctly', async () => {
    const isDate = (dateStr:string) =>  ! isNaN(new Date(dateStr).getTime());

    const inventory = await BucketInventory.getInstance(sam);
    const hierarchy:HierarchicalStructure = inventory.getContentsAsHierarchy();
    expect(hierarchy).toBeDefined();
    const samObj = hierarchy[sam] as HierarchicalStructure;
    expect(Object.keys(hierarchy).length).toEqual(1);
    expect(Object.keys(hierarchy)[0]).toEqual(sam);
    expect(Object.keys(samObj).length).toEqual(2);

    const entity1Obj = samObj['entity1'] as HierarchicalStructure
    const aff1Obj = entity1Obj[aff1] as HierarchicalStructure;
    const aff2Obj = entity1Obj[aff2] as HierarchicalStructure;
    const aff3Obj = entity1Obj[aff3] as HierarchicalStructure;
    expect(Object.keys(samObj)[0]).toEqual('entity1');
    expect(Object.keys(entity1Obj).length).toEqual(3);
    expect(Object.keys(entity1Obj)[0]).toEqual(aff1);
    expect(Object.keys(entity1Obj)[1]).toEqual(aff2);
    expect(Object.keys(entity1Obj)[2]).toEqual(aff3);

    expect(Object.keys(aff1Obj).length).toEqual(1);
    expect(Object.keys(aff1Obj)[0]).toEqual(EXHIBIT);
    expect(Object.keys(aff1Obj[EXHIBIT]).length).toEqual(3);
    expect(isDate(Object.keys(aff1Obj[EXHIBIT])[0])).toBeTruthy();
    expect(isDate(Object.keys(aff1Obj[EXHIBIT])[1])).toBeTruthy();
    expect(isDate(Object.keys(aff1Obj[EXHIBIT])[2])).toBeTruthy();
    expect(Object.values(aff1Obj[EXHIBIT])[0]['correction']).toEqual(false);
    expect(Object.values(aff1Obj[EXHIBIT])[1]['correction']).toEqual(true);
    expect(Object.values(aff1Obj[EXHIBIT])[2]['correction']).toEqual(true);

    expect(Object.keys(aff2Obj).length).toEqual(1);
    expect(Object.keys(aff2Obj)[0]).toEqual(EXHIBIT);
    expect(Object.keys(aff2Obj[EXHIBIT]).length).toEqual(3);
    expect(isDate(Object.keys(aff2Obj[EXHIBIT])[0])).toBeTruthy();
    expect(isDate(Object.keys(aff2Obj[EXHIBIT])[1])).toBeTruthy();
    expect(isDate(Object.keys(aff2Obj[EXHIBIT])[2])).toBeTruthy();
    expect(Object.values(aff2Obj[EXHIBIT])[0]['correction']).toEqual(false);
    expect(Object.values(aff2Obj[EXHIBIT])[1]['correction']).toEqual(true);
    expect(Object.values(aff2Obj[EXHIBIT])[2]['correction']).toEqual(true);

    expect(Object.keys(aff3Obj).length).toEqual(1);
    expect(Object.keys(aff3Obj)[0]).toEqual(EXHIBIT);
    expect(Object.keys(aff3Obj[EXHIBIT]).length).toEqual(3);
    expect(isDate(Object.keys(aff3Obj[EXHIBIT])[0])).toBeTruthy();
    expect(isDate(Object.keys(aff3Obj[EXHIBIT])[1])).toBeTruthy();
    expect(isDate(Object.keys(aff3Obj[EXHIBIT])[2])).toBeTruthy();
    expect(Object.values(aff3Obj[EXHIBIT])[0]['correction']).toEqual(false);
    expect(Object.values(aff3Obj[EXHIBIT])[1]['correction']).toEqual(true);
    expect(Object.values(aff3Obj[EXHIBIT])[2]['correction']).toEqual(true);
    
    
    const entity2Obj = samObj['entity1'] as HierarchicalStructure
    const aff4Obj = entity2Obj[aff1] as HierarchicalStructure;
    const aff5Obj = entity2Obj[aff2] as HierarchicalStructure;
    const aff6Obj = entity2Obj[aff3] as HierarchicalStructure;
    expect(Object.keys(samObj)[0]).toEqual('entity1');
    expect(Object.keys(entity2Obj).length).toEqual(3);
    expect(Object.keys(entity2Obj)[0]).toEqual(aff1);
    expect(Object.keys(entity2Obj)[1]).toEqual(aff2);
    expect(Object.keys(entity2Obj)[2]).toEqual(aff3);

    expect(Object.keys(aff4Obj).length).toEqual(1);
    expect(Object.keys(aff4Obj)[0]).toEqual(EXHIBIT);
    expect(Object.keys(aff4Obj[EXHIBIT]).length).toEqual(3);
    expect(isDate(Object.keys(aff4Obj[EXHIBIT])[0])).toBeTruthy();
    expect(isDate(Object.keys(aff4Obj[EXHIBIT])[1])).toBeTruthy();
    expect(isDate(Object.keys(aff4Obj[EXHIBIT])[2])).toBeTruthy();
    expect(Object.values(aff4Obj[EXHIBIT])[0]['correction']).toEqual(false);
    expect(Object.values(aff4Obj[EXHIBIT])[1]['correction']).toEqual(true);
    expect(Object.values(aff4Obj[EXHIBIT])[2]['correction']).toEqual(true);

    expect(Object.keys(aff5Obj).length).toEqual(1);
    expect(Object.keys(aff5Obj)[0]).toEqual(EXHIBIT);
    expect(Object.keys(aff5Obj[EXHIBIT]).length).toEqual(3);
    expect(isDate(Object.keys(aff5Obj[EXHIBIT])[0])).toBeTruthy();
    expect(isDate(Object.keys(aff5Obj[EXHIBIT])[1])).toBeTruthy();
    expect(isDate(Object.keys(aff5Obj[EXHIBIT])[2])).toBeTruthy();
    expect(Object.values(aff5Obj[EXHIBIT])[0]['correction']).toEqual(false);
    expect(Object.values(aff5Obj[EXHIBIT])[1]['correction']).toEqual(true);
    expect(Object.values(aff5Obj[EXHIBIT])[2]['correction']).toEqual(true);

    expect(Object.keys(aff6Obj).length).toEqual(1);
    expect(Object.keys(aff6Obj)[0]).toEqual(EXHIBIT);
    expect(Object.keys(aff6Obj[EXHIBIT]).length).toEqual(3);
    expect(isDate(Object.keys(aff6Obj[EXHIBIT])[0])).toBeTruthy();
    expect(isDate(Object.keys(aff6Obj[EXHIBIT])[1])).toBeTruthy();
    expect(isDate(Object.keys(aff6Obj[EXHIBIT])[2])).toBeTruthy();
    expect(Object.values(aff6Obj[EXHIBIT])[0]['correction']).toEqual(false);
    expect(Object.values(aff6Obj[EXHIBIT])[1]['correction']).toEqual(true);
    expect(Object.values(aff6Obj[EXHIBIT])[2]['correction']).toEqual(true);
  });
});