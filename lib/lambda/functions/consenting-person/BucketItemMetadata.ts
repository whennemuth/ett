import { log } from "../../Utils";
import { BucketItem } from "./BucketItem";

export const ExhibitFormsBucketEnvironmentVariableName = 'EXHIBIT_FORMS_BUCKET_NAME';

export enum ItemType {
  EXHIBIT = 'exhibit', DISCLOSURE = 'disclosure', CORRECTION_FORM = 'correction'
}
export type BucketItemMetadataParms = {
  consenterEmail: string,
  entityId: string,
  affiliateEmail?: string,
  itemType: ItemType,
  correction?: boolean,
  // If any of the remaining are specified, metadata should be specific to a single object
  savedDate?: Date,
  getTag?: Function
};

/**
 * This class deals with naming convention for single exhibit forms that are to be stored in an s3 bucket.
 * The name must reflect the consenter, entity, affiliate, correction status, and saved date. These elements
 * of the name are being referred to as "metadata" and are combined to form an s3 object key for the pdf file and
 * make for a rudimentary basis for querying the right file(s) out of the bucket when they need to be retrieved. 
 */
export class BucketItemMetadata {
  private bucket:BucketItem;

  constructor() {
    this.bucket = new BucketItem();
  }

  /**
   * Get the metadata parameters for a specific single exhibit/disclosure form in s3.
   * @param metadata Will usually be specific enough to identify a specific object in s3, but may indicate
   * the original single exhibit/disclosure form AND all of its corrections. If the latter is the case, the metadata for
   * the most recent correction is returned.
   * @returns The s3 object key of the found item recomposed into a javascript object
   */
  public getLatest = async (metadata:BucketItemMetadataParms|string): Promise<BucketItemMetadataParms|undefined> => {
    const { bucket } = this;
    const { CORRECTION_FORM } = ItemType;
    if(typeof metadata == 'string') {
      // metadata is in the form of an s3 object key, so convert it to a metadata object.
      metadata = BucketItemMetadata.fromBucketObjectKey(metadata);
    }

    const { consenterEmail, itemType, entityId, affiliateEmail } = metadata;
    
    if( ! consenterEmail) {
      log(metadata, `Invalid parameters for ${itemType} form lookup in s3, consenterEmail missing`);
      return undefined;
    }
    
    if( ! entityId && itemType != CORRECTION_FORM) {
      log(metadata, `Invalid parameters for ${itemType} form lookup in s3, entity_id missing`);
      return undefined;
    }

    if( ! affiliateEmail && itemType != CORRECTION_FORM) {
      log(metadata, `Invalid parameters for ${itemType} form lookup in s3, affiliateEmail missing`);
      return undefined;
    }

    // Get all bucket items for the consenter of the specified type (exhibit or disclosure)
    const output = await bucket.listMetadata(metadata);
    const { items } = output;
    return BucketItemMetadata.getLatestFrom(items, itemType);
  }

  public static getLatestFrom = (forms:BucketItemMetadataParms[], itemType:ItemType):BucketItemMetadataParms|undefined => {
    // Reduce the items down to the one that was created most recently.
    const reducer = (survingForm:BucketItemMetadataParms, currentForm:BucketItemMetadataParms):BucketItemMetadataParms => {
      if( ! survingForm) {
        return currentForm;
      }
      if(survingForm.itemType == itemType && currentForm.itemType != itemType) {
        return survingForm;
      }
      if(currentForm.itemType == itemType && survingForm.itemType != itemType) {
        return currentForm;
      }
      if( survingForm.correction && ! currentForm.correction) {
        return survingForm;
      }
      if(currentForm.correction && ! survingForm.correction) {
        return currentForm;
      }
      const cfDate = currentForm.savedDate;
      const sfDate = survingForm.savedDate;
      if((cfDate ? cfDate.getTime() : 0) >= (sfDate ? sfDate.getTime() : 0)) {
        return currentForm;
      }
      return survingForm
    };
    // Use an initial value that can be identified as something to be discarded if it is what the reducer returns
    const initialValue = {
      consenterEmail: 'NO-RESULT',
      entityId: 'NO-RESULT',
      itemType: ItemType.EXHIBIT,
    } as BucketItemMetadataParms;
    // Reduce
    const form:BucketItemMetadataParms = forms.reduce(reducer, initialValue);

    if(form.entityId == 'NO-RESULT') {
      return undefined;
    }
    return form;
  }

  /**
   * Find the one single exhibit form in s3 that reflects the specified consenter, entity, and affiliate email
   * in its name, and return the most recent correction if any exist, else return the most recent of what remains.
   * @param parms 
   * @returns The s3 object key of the found item
   */
  public getLatestS3ObjectKey = async (parms:BucketItemMetadataParms): Promise<string|undefined> => {
    const { getLatest } = this;
    const output = await getLatest(parms);
    if( ! output) {
      return undefined;
    }
    const { consenterEmail, itemType, entityId, affiliateEmail, correction, savedDate } = output;
    const s3ObjectKey = BucketItemMetadata.toBucketFileKey({
      itemType, consenterEmail, entityId, affiliateEmail, correction, savedDate
    });
    if( ! (s3ObjectKey ?? '').toLowerCase().endsWith('.pdf')) {
      return undefined;
    }
    return s3ObjectKey;
  }

  /**
   * @param f1 
   * @param f2 
   * @returns true if 2 forms exist under a consenter/entityId/affiliate subdirectory, and one is a 
   * correction and the other is either another correction or the original, or both are the same form.
   */
  public static areRelated = (f1:BucketItemMetadataParms, f2:BucketItemMetadataParms):boolean => {
    if(f1.consenterEmail != f2.consenterEmail) return false;
    if(f1.itemType == ItemType.CORRECTION_FORM || f2.itemType == ItemType.CORRECTION_FORM) return false;
    if(f1.entityId != f2.entityId) return false;
    if(f1.affiliateEmail != f2.affiliateEmail) return false;
    if(f1.itemType != f2.itemType) return false;
    return true;
  }

  public static areEqual = (f1:BucketItemMetadataParms, f2:BucketItemMetadataParms):boolean => {
    if( ! BucketItemMetadata.areRelated(f1, f2)) return false;
    return f1.savedDate == f2.savedDate;
  }
  
  /**
   * Convert a consenters single set of exhibit form metadata parms into an s3 object key.
   * @param metadata 
   * @param directoryOnly If the metadata resolves to a specific file, return the parent directory instead.
   * @returns 
   */
  private static toBucketPath = (metadata:BucketItemMetadataParms):string => {

    const { itemType, consenterEmail, affiliateEmail, entityId='all', correction, savedDate=(new Date(Date.now())) } = metadata;

    if( ! consenterEmail) {
      throw new Error(`consenterEmail parameter missing!`);
    }

    // Define some functions:
    const helpers = {
      // Url encode a string, and replace the '%' characters with an s3 object-key-friendly substitution.
      encode: (s:string) => { 
        return encodeURIComponent(s).replace(/%/g, '(pct)'); 
      },
      // Encode an email portion of an object key, based on url encoding, but with further substitutions
      // that make the key conform to s3 naming restrictions.
      getEncodedEmail: (email:string) => {
        const local = encode(email.substring(0, email.indexOf('@')));
        const domain = encode(email.substring(email.indexOf('@') + 1));
        return `${local}(at)${domain}`;
      },
      // Get the ISO formated representation of a date with ':' character substitutions that
      // avoid the s3 object key naming restrictions.
      getSafeIsoDate: () => {
        return savedDate.toISOString().replace(/\:/g, '!');
      }
    };

    const { encode, getEncodedEmail, getSafeIsoDate} = helpers;

    // If a consenter correction form is indicated, return a consenterEmail/pdfFile s3 path
    if( ( ! entityId || entityId == 'all' ) && itemType == ItemType.CORRECTION_FORM) {
      return `${getEncodedEmail(consenterEmail)}/${itemType}-${getSafeIsoDate()}.pdf`;
    }

    // If the entity_id value is "all", then return an object key that stops at the consenter.
    if( entityId == 'all') {
      return `${getEncodedEmail(consenterEmail)}`;
    }

    // If there is no affiliate specified, then return an object key that stops at the entity.
    if( ! affiliateEmail) {
      return `${getEncodedEmail(consenterEmail)}/${encode(entityId)}`;
    }
    
    let key = `${getEncodedEmail(consenterEmail)}/${encode(entityId)}/${getEncodedEmail(affiliateEmail)}`;
    
    key = correction ? 
      `${key}/CORRECTED/${itemType}-${getSafeIsoDate()}.pdf` : 
      `${key}/${itemType}-${getSafeIsoDate()}.pdf`;
      
    return key;
  }

  /**
   * Convert metadata parameters into an s3 object key that indicates a single file
   * @param metadata 
   * @returns 
   */
  public static toBucketFileKey = (metadata:BucketItemMetadataParms):string => {
    const { itemType, entityId, affiliateEmail } = metadata;
    if(itemType != ItemType.CORRECTION_FORM) {
      if( ! entityId ) {
        throw new Error(`Provided metadata cannot specify a file without entityId: ${JSON.stringify(metadata, null, 2)}`);
      }
      if( ! affiliateEmail ) {
        throw new Error(`Provided metadata cannot specify a file without affiliateEmail: ${JSON.stringify(metadata, null, 2)}`);
      }
    }
    if( ! itemType ) {
      throw new Error(`Provided metadata cannot specify a file without itemType: ${JSON.stringify(metadata, null, 2)}`);
    }
    const s3ObjectKey = BucketItemMetadata.toBucketPath(metadata);
    return s3ObjectKey
  }

  /**
   * Convert metadata parameters into an s3 object key that indicates a directory
   * @param metadata 
   * @returns 
   */
  public static toBucketFolderKey = (metadata:BucketItemMetadataParms):string => {
    const s3ObjectKey = BucketItemMetadata.toBucketPath(metadata);
    if(s3ObjectKey.endsWith('.pdf')) {
      // Override the default behavior of generating a new file name if enough metadata fields are present.
      return s3ObjectKey.substring(0, s3ObjectKey.lastIndexOf('/'));
    }
    return s3ObjectKey
  }

  /**
   * Convert an s3 object key that represents storage of a single exhibit form into the corresponding metadata.
   * @param key 
   * @returns 
   */
  public static fromBucketObjectKey = (key:string):BucketItemMetadataParms => {
    const isConsenterCorrectionForm = (name:string):boolean => {
      return name.toLowerCase().trim().endsWith('.pdf') && name.includes(ItemType.CORRECTION_FORM); 
    };

    /**
     * Given the name of a file, break it into its parts and add those parts to the provided metadata object
     * @param name 
     * @returns 
     */
    const complementMetadataWithFileName = (metadata:BucketItemMetadataParms, filename:string) => {
      filename = filename.replace(/\.pdf$/, '').replace(/\!/g, ':');
      const itemType = filename.substring(0, filename.indexOf('-')) as ItemType;
      const isoStr = filename.substring(filename.indexOf('-')+1, filename.length);
      const savedDate = new Date(isoStr);
      metadata.itemType = itemType;
      metadata.savedDate = savedDate;
      const bucket = new BucketItem();
      metadata.getTag = async (tagname:string):Promise<string|undefined> => {      
        return bucket.getTag(metadata, tagname);
      }
      return metadata;
    }

    // Trim off any trailing "/" characters
    if(key.trim().endsWith('/')) {
      return BucketItemMetadata.fromBucketObjectKey(key.substring(0, key.lastIndexOf('/')));
    }

    // Define a function that first restores URI encoding, and then decodes from URI format to original value. 
    const decode = (s:string) => { return decodeURIComponent(s.replace(/\(pct\)/g, '%')); }

    // Split the object key as if a path into its separate subfolders and filename. 
    const parts = key.split('/');

    // Restore the consenter email portion from the object key:
    let emailParts = parts[0].split('(at)');
    const consenterEmail = `${decode(emailParts[0])}@${decode(emailParts[1])}`;
    if(parts.length < 2) {
      return { consenterEmail } as BucketItemMetadataParms;
    }

    // Check to see if this is a consenter correction form
    if(parts.length == 2 && isConsenterCorrectionForm(parts[1])) {
      const metadata = { consenterEmail } as BucketItemMetadataParms;
      return complementMetadataWithFileName(metadata, parts[1]);
    }

    // Restore the entity_id portion from the object key:
    const entityId = decode(parts[1]);
    if(parts.length < 3 ) {
      return { consenterEmail, entityId } as BucketItemMetadataParms;
    };

    // Restore the affiliate email portion from the object key:
    emailParts = parts[2].split('(at)');
    const affiliateEmail = `${decode(emailParts[0])}@${decode(emailParts[1])}`;
    if(parts.length < 4) {
      return { consenterEmail, entityId, affiliateEmail } as BucketItemMetadataParms;
    }

    // If the object key only specifies a directory, return the corresponding metadata now
    if(parts[parts.length-1] == 'CORRECTED' || parts.length < 4) {
      return { consenterEmail, affiliateEmail, entityId } as BucketItemMetadataParms
    }

    // Restore the 'CORRECTED' portion from the object key if indicated:
    const correction = parts[3] == 'CORRECTED';
    const name = correction ? parts[4] : parts[3];

    // Restore the file name itself from the object key and return the restored metadata objec:
    const metadata = { consenterEmail, affiliateEmail, entityId, correction } as BucketItemMetadataParms;
    return complementMetadataWithFileName(metadata, name);
  }

}