import { IContext } from "../../../../contexts/IContext";
import { log } from "../../Utils";
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

  constructor(consenterEmail:string, entityId?:string) {
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
   * Equivalent of sql "SELECT DISTINCT entity_id" across the inventory.
   * @returns 
   */
  public getEntityIds = ():string[] => {
    const contents = this.getContents();
    const entityIds = [] as string[];
    contents.forEach((metadata) => {
      const { entityId } = metadata;
      if(entityId && ! entityIds.includes(entityId)) {
        entityIds.push(entityId);
      }
    });
    return entityIds;
  }

  /**
   * Get every form a consenter has in inventory (original and corrected) for a specified affiliate
   * @param affiliateEmail 
   * @returns 
   */
  public getAffiliateForms = (affiliateEmail:string, itemType?:ItemType):BucketItemMetadataParms[] => {
    const contents = this.getContents();
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
    const contents = this.getContents();
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
    const contents = this.getContents();
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

  /**
   * Get all forms that are eligible for being emailed - that is, they have either not been corrected, or
   * they are the latest correction.
   */
  public getAllLatestForms = ():BucketItemMetadataParms[] => {
    const { contents } = this;
    const { areRelated, areEqual } = BucketItemMetadata;
    const results = [] as BucketItemMetadataParms[];

    /**
     * An accumulator function that "chooses" between two forms the younger of the two if they are "related"
     * @param prior 
     * @param current 
     * @returns 
     */
    const accumulator = (prior:BucketItemMetadataParms, current:BucketItemMetadataParms) => {
      if( ! areRelated(prior, current)) {
        return prior;
      }
      if( ! prior.savedDate) return current // Huh? This should not happen
      if( ! current.savedDate) return prior // Huh? This should not happen
      // "Choose" the younger of the two forms
      return prior.savedDate.getTime() < current.savedDate.getTime() ? current : prior;
    }

    // Iterate over the contents and pick out the "youngest" of related forms.
    contents.forEach(form => {
      const latest = contents.reduce(accumulator, form);
      const duplicateResult = results.find(f => areEqual(f, latest));
      if( ! duplicateResult) {
        results.push(latest);
      }
    });

    return results;
  }

  /**
   * Get all forms in the inventory for the consenter that are of a specified type
   * @param itemType 
   * @returns 
   */
  public getAllFormsOfType = (itemType:ItemType) => {
    const contents = this.getContents();
    return contents.filter(metadata => {
      return metadata.itemType == itemType;
    })
  }
}



/**
 * RUN MANUALLY: Modify consenter and entityId as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/consenting-person/BucketInventory.ts')) {

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

    // log(inventory.getKeys());
    // log(inventory.getAffiliateEmails());
    log(inventory.getAffiliateForms('affiliate1@warhen.work', ItemType.EXHIBIT));
    // log(inventory.getLatestAffiliateItem('affiliate1@warhen.work', ItemType.EXHIBIT));
  })();
}