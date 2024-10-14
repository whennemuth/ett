import { IContext } from "../../../../contexts/IContext";
import { Consenter } from "../../_lib/dao/entity";
import { BucketItem, ListObjectsOutput } from "./BucketItem";
import { BucketItemMetadata, BucketItemMetadataParms, ExhibitFormsBucketEnvironmentVariableName, ItemType } from "./BucketItemMetadata";

/**
 * This class represents all items in the exhibit forms bucket for a particular consenting individual and entity.
 * Querying and filtering logic is provided.
 */
export class BucketInventory {
  private email:string;
  private entityId?:string;
  private prefix:string;
  private keys:string[] = [];
  private contents:BucketItemMetadataParms[] = [];

  public static getInstance = async (email:string, entityId?:string):Promise<BucketInventory> => {
    const inventory = new BucketInventory(email, entityId);

    const bucketItem = new BucketItem({ email } as Consenter);
    const output:ListObjectsOutput = await bucketItem.listObjects({
      entityId
    } as BucketItemMetadataParms);

    const { Prefix, listedObjects: { Contents=[] } } = output;
    inventory.prefix = Prefix;
    Contents.forEach(o => {
      const { Key } = o;
      if(Key) {
        inventory.keys.push(Key);
        inventory.contents.push(BucketItemMetadata.fromBucketObjectKey(Key));
      }      
    })
  
    return inventory;
  }

  private constructor(email:string, entityId?:string) {
    this.email = email;
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
  public getAffiliateForms = (affiliateEmail:string) => {
    return this.contents.filter(metadata => metadata.affiliateEmail == affiliateEmail)
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

  /**
   * Get the form of a specified type that was most recently submitted by a consenter for a specified affiliate.
   * @param affiliateEmail 
   * @param itemType 
   * @returns 
   */
  public getLatestAffiliateItem = (affiliateEmail:string, itemType:ItemType):BucketItemMetadataParms|undefined => {
    const { contents, getAffiliateForms } = this;
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
    console.log(JSON.stringify(inventory.getLatestAffiliateItem('affiliate1@warhen.work', ItemType.EXHIBIT), null, 2));
  })();
}