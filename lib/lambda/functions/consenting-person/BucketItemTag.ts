import { IContext } from "../../../../contexts/IContext";
import { log } from "../../Utils";
import { BucketInventory } from "./BucketInventory";
import { Tags } from "./BucketItem";
import { BucketItemMetadata, BucketItemMetadataParms, ExhibitFormsBucketEnvironmentVariableName, ItemType } from "./BucketItemMetadata";

/**
 * This class is a utility for searching tags on items stored in the exhibit forms bucket against a the 
 * /consenter/entity/affiliate subdirectory convention.
 */
export class TagInspector {
  private tagName:string;

  constructor(tagName:string) {
    this.tagName = tagName;
  }

  /**
   * Query for a list of s3 object keys that fall under the specified s3 path prefix and pick through them 
   * for the first one that has the tag and return its value.
   * 
   * @param s3Path This normally would refer to a specific point in the /consenter/entity/affiliate directory
   * hierarchy, but if it refers to a specific file, the query starts its search from the affiliate subdirectory.
   * @returns 
   */
  public findTagAmongAffiliateItems = async (s3Path:string, _itemType?:ItemType):Promise<string|void> => {
    const { tagName } = this;
    
    try {
      // Break the object key into its parts:
      const { fromBucketObjectKey } = BucketItemMetadata;
      const metadata = fromBucketObjectKey(s3Path);
      let { entityId, consenterEmail, affiliateEmail, correction, savedDate, itemType } = metadata;
      const prefix = { consenterEmail, entityId, affiliateEmail };
      log(prefix, `Checking tags for items under prefix`);

      // Query the bucket for every item under the specific /consenter/entityId/affiliate "subdirectory"
      const inventory = await BucketInventory.getInstance(consenterEmail!, entityId);
      let allMetadata = inventory.getAffiliateForms(affiliateEmail!, itemType);

      // The results should NEVER be empty, but accomodate anyway. 
      if(allMetadata.length == 0) {
        log(prefix, `Query against bucket returned no object keys under prefix`);
        return;
      }

      // Refine the results if possible
      if(savedDate) {
        allMetadata = allMetadata.filter(m => (m.savedDate ?? new Date()).toISOString() == savedDate!.toISOString() )
      }
      itemType = _itemType ?? itemType;
      if(itemType) {
        allMetadata = allMetadata.filter(m => m.itemType == itemType)
      }

      // Tags will most likely be found on the oldest item(s), so sort the array so that they are on top
      allMetadata.sort((metadata1, metadata2) => { 
        return (metadata1.savedDate ?? new Date()).getMilliseconds() - (metadata2.savedDate ?? new Date()).getMilliseconds();
      });

      // Start querying the tags of each item in the bucket until one is found that indicates a disclosure request was sent.
      for(let i=0; i<allMetadata.length; i++) {
        const metadata = allMetadata[i];
        const getTag = metadata.getTag ?? (async () => undefined );
        const tagValue = await getTag(tagName);
        if(tagValue) {
          log(prefix, `Tag found ${tagName} = ${tagValue} under prefix`);
          return tagValue;
        }
      }

      // Tag being sought was found for none of the items - hence no disclosure request was sent.
      log(prefix, `No bucket item tagging found for items under prefix`);
      return;
    }
    catch(e) {
      log(e);
      return;
    }
  }

  public tagExistsAmong = async (s3Path:string, itemType?:ItemType):Promise<boolean> => {
    const tagValue = await this.findTagAmongAffiliateItems(s3Path, itemType);
    return tagValue != undefined;
  }

}




/**
 * RUN MANUALLY: Modify the region, task, and deleteDepth as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_BUCKET_ITEM_TAG_INSPECTOR') {

  (async ()=> {
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, REGION, TAGS: { Landscape }} = context;
    const prefix = `${STACK_ID}-${Landscape}`;
    const bucketName = `${prefix}-exhibit-forms`;
    process.env[ExhibitFormsBucketEnvironmentVariableName] = bucketName;
    process.env.REGION = REGION;

    const metadata = {
      consenterEmail: 'cp2@warhen.work',
      // entityId: '13376a3d-12d8-40e1-8dee-8c3d099da1b2',
      // affiliateEmail: 'affiliate1@warhen.work',
    } as BucketItemMetadataParms;
    const s3Path = BucketItemMetadata.toBucketFolderKey(metadata);

    // const metadata = {
    //   consenterEmail: 'cp2@warhen.work',
    //   entityId: '13376a3d-12d8-40e1-8dee-8c3d099da1b2',
    //   affiliateEmail: 'affiliate1@warhen.work',
    //   savedDate: new Date('2024-10-10T02:59:40.088Z'),
    //   itemType: ItemType.EXHIBIT
    // } as BucketItemMetadataParms;
    // const s3Path = BucketItemMetadata.toBucketFileKey(metadata);

    const tagInspector = new TagInspector(Tags.DISCLOSED);
    const tagValue = await tagInspector.findTagAmongAffiliateItems(s3Path);
    log(`${Tags.DISCLOSED} = ${tagValue}`);
  })();
}