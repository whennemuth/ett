import { IContext } from "../../../../contexts/IContext";
import { BucketItem } from "./BucketItem";
import { BucketItemMetadata, BucketItemMetadataParms, ExhibitFormsBucketEnvironmentVariableName, ItemType } from "./BucketItemMetadata";

/**
 * This class represents all items in the exhibit forms bucket for a particular consenting individual, 
 * A lookup to list ALL items for that consenter is performed against the bucket, but querying and 
 * filtering logic is provided to optionally reduce scope to a particular entity or entity & affiliate.
 */
export class BucketInventory {
  private consenterEmail:string;
  private entityId?:string;
  private prefix:string;
  private keys:string[] = [];
  private contents:BucketItemMetadataParms[] = [];

  public static getInstance = async (consenterEmail:string, entityId?:string):Promise<BucketInventory> => {
    const inventory = new BucketInventory(consenterEmail, entityId);
    const { fromBucketObjectKey } = BucketItemMetadata
    const bucketItem = new BucketItem();
    const output = await bucketItem.listKeys({
      consenterEmail, entityId
    } as BucketItemMetadataParms);

    const { Prefix, keys } = output;
    inventory.prefix = Prefix;

    keys.forEach(key => {
      inventory.keys.push(key);
      inventory.contents.push(fromBucketObjectKey(key));      
    })
  
    return inventory;
  }

  private constructor(consenterEmail:string, entityId?:string) {
    this.consenterEmail = consenterEmail;
    this.entityId = entityId;
  }

  public getContents = () => {
    return this.contents
  }

  public getKeys = () => {
    return this.keys;
  }

  public getPrefix = () => {
    return this.prefix;
  }

  /**
   * Get every form a consenter has in inventory (original and corrected) for a specified affiliate
   * @param affiliateEmail 
   * @returns 
   */
  public getAffiliateForms = (affiliateEmail:string, itemType?:ItemType):BucketItemMetadataParms[] => {
    const { contents } = this;
    let filtered = contents.filter(metadata => {
      return affiliateEmail == undefined || metadata.affiliateEmail == affiliateEmail
    });
    if(itemType) {
      filtered = filtered.filter(metadata => metadata.itemType = itemType);
    }
    return filtered;
  }

  /**
   * Equivalent of sql "SELECT DISTINCT affiliateEmail" across the inventory.
   * @returns 
   */
  public getAffiliateEmails = ():string[] => {
    const { contents } = this;
    const emails = [] as string[];
    contents.forEach((metadata) => {
      const { affiliateEmail:email } = metadata;
      if(email && ! emails.includes(email)) {
        emails.push(email);
      }
    });
    return emails;
  }

  public hasAffiliate = (affiliateEmail:string, entityId?:string):boolean => {
    const { contents } = this;
    let filtered = contents.filter(metadata => metadata.affiliateEmail == affiliateEmail);
    if(entityId) {
      filtered = filtered.filter(metadata => metadata.entityId == entityId);
    }
    return filtered.length > 0;
  }

  /**
   * Get the form of a specified type that was most recently submitted by a consenter for a specified affiliate.
   * @param affiliateEmail 
   * @param itemType 
   * @returns 
   */
  public getLatestAffiliateItem = (affiliateEmail:string, itemType:ItemType):BucketItemMetadataParms|undefined => {
    const { getAffiliateForms } = this;
    const candidates = getAffiliateForms(affiliateEmail);
    return BucketItemMetadata.getLatestFrom(candidates, itemType);
  }
}



/**
 * RUN MANUALLY: Modify consenter and entityId as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_BUCKET_INVENTORY') {

  (async() => {
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, REGION, TAGS: { Landscape } } = context;
    const prefix = `${STACK_ID}-${Landscape}`;
    const bucketName = `${prefix}-exhibit-forms`;

    process.env[ExhibitFormsBucketEnvironmentVariableName] = bucketName;
    process.env.REGION = REGION;

    let entityId:string|undefined;
    entityId = 'eea2d463-2eab-4304-b2cf-cf03cf57dfaa'
    const inventory = await BucketInventory.getInstance('cp3@warhen.work', entityId);

    // console.log(JSON.stringify(inventory.getKeys(), null, 2));
    // console.log(JSON.stringify(inventory.getAffiliateEmails(), null, 2));
    console.log(JSON.stringify(inventory.getAffiliateForms('affiliate1@warhen.work', ItemType.EXHIBIT), null, 2))
    // console.log(JSON.stringify(inventory.getLatestAffiliateItem('affiliate1@warhen.work', ItemType.EXHIBIT), null, 2));
  })();
}