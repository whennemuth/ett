import { BucketItem, ListObjectsOutput } from "./BucketItem";

export const ExhibitFormsBucketEnvironmentVariableName = 'EXHIBIT_FORMS_BUCKET_NAME';

export enum ItemType {
  EXHIBIT = 'exhibit', DISCLOSURE = 'disclosure'
}
export type BucketItemMetadataParms = {
  itemType: ItemType,
  entityId: string,
  consenterEmail?: string,
  affiliateEmail?: string,
  correction?: boolean,
  savedDate?: Date
};

/**
 * This class deals with naming convention for single exhibit forms that are to be stored in an s3 bucket.
 * The name must reflect the consenter, entity, affiliate, correction status, and saved date. These elements
 * of the name are being referred to as "metadata" and are combined to form an s3 object key for the pdf file and
 * make for a rudimentary basis for querying the right file(s) out of the bucket when they need to be retrieved. 
 */
export class BucketItemMetadata {
  private bucket:BucketItem;

  constructor(bucket:BucketItem) {
    this.bucket = bucket;
  }

  /**
   * Get a list of exhibit forms from a query against the s3 bucket. Matches are those s3 objects
   * whose keys reflect the parms. Parameters that are specific to the saved date will always 
   * return just one item, while parms specific only to the consenter email may return many items. 
   * @param parms 
   * @returns 
   */
  public listEach = async (parms:BucketItemMetadataParms): Promise<BucketItemMetadataParms[]> => {
    const { entityId, affiliateEmail, savedDate } = parms;
    const { bucket } = this;

    if( ! entityId) return [];

    if(affiliateEmail && savedDate) {
      return [parms];
    }

    const output:ListObjectsOutput = await bucket.listObjects(parms);
    const { Prefix, listedObjects: { Contents } } = output;
    if( ! Contents || Contents.length === 0) {
      return [];
    }
    const exhibitForms = Contents.map(s3Object => {
      const { Key } = s3Object;
      return Key ? BucketItemMetadata.fromBucketObjectKey(Key) : undefined;
    }).filter(metadata => { return metadata != undefined; }) as BucketItemMetadataParms[];

    return exhibitForms;
  }

  /**
   * Get the metadata parameters for a specific single exhibit/disclosure form in s3.
   * @param parms Will usually be specific enough to identify a specific object in s3, but may indicate
   * the original single exhibit/disclosure form AND all of its corrections. If the latter is the case, the metadata for
   * the most recent correction is returned.
   * @returns The s3 object key of the found item recomposed into a javascript object
   */
  public getLatest = async (parms:BucketItemMetadataParms|string): Promise<BucketItemMetadataParms|undefined> => {
    if(typeof parms == 'string') {
      // metadata is in the form of an s3 object key, so convert it to a metadata object.
      parms = BucketItemMetadata.fromBucketObjectKey(parms);
    }

    const { itemType, entityId, affiliateEmail } = parms;
    
    if( ! entityId) {
      console.log(`Invalid parameters for ${itemType} form lookup in s3, entity_id missing: ${JSON.stringify(parms, null, 2)}`);
      return undefined;
    }

    if( ! affiliateEmail) {
      console.log(`Invalid parameters for ${itemType} form lookup in s3, affiliateEmail missing: ${JSON.stringify(parms, null, 2)}`);
      return undefined;
    }

    // Get all bucket items for the consenter of the specified type (exhibit or disclosure)
    const forms = await this.listEach(parms);

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
    // Use an initial value that can be identified as something to discarded if it is what the reducer returns
    const initialValue = {
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
    const { bucket: { consenter: { email:consenterEmail } }, getLatest } = this;
    const output = await getLatest(parms);
    if( ! output) {
      return undefined;
    }
    const { itemType, entityId, affiliateEmail, correction, savedDate } = output;
    const s3ObjectKey = BucketItemMetadata.toBucketObjectKey({
      itemType, consenterEmail, entityId, affiliateEmail, correction, savedDate
    });
    if( ! (s3ObjectKey ?? '').toLowerCase().endsWith('.pdf')) {
      return undefined;
    }
    return s3ObjectKey;
  }  


  
  /**
   * Convert a consenters single set of exhibit form metadata parms into an s3 object key.
   * @param parms 
   * @returns 
   */
  public static toBucketObjectKey = (parms:BucketItemMetadataParms):string => {
    const { itemType, consenterEmail, affiliateEmail, entityId, correction, savedDate=(new Date()) } = parms;

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

    // If the entity_id value is "all", then return an object key that stops at the consenter.
    if( entityId == 'all') {
      return `${getEncodedEmail(consenterEmail)}`;
    }

    // If there is no affiliate specified, then return an object key that stops at the entity.
    if( ! affiliateEmail) {
      return `${getEncodedEmail(consenterEmail)}/${encode(entityId)}`;
    }

    // Return the full object key for a new single exhibit form or a corrected one. 
    let key = `${getEncodedEmail(consenterEmail)}/${encode(entityId)}/${getEncodedEmail(affiliateEmail)}`;
    return correction ? 
      `${key}/CORRECTED/${itemType}-${getSafeIsoDate()}.pdf` : 
      `${key}/${itemType}-${getSafeIsoDate()}.pdf`;
  }

  /**
   * Convert an s3 object key that represents storage of a single exhibit form into the corresponding metadata.
   * @param key 
   * @returns 
   */
  public static fromBucketObjectKey = (key:string):BucketItemMetadataParms => {

    // Define a function that first restores URI encoding, and then decodes from URI format to original value. 
    const decode = (s:string) => { return decodeURIComponent(s.replace(/\(pct\)/g, '%')); }

    // Split the object key as if a path into its separate subfolders and filename. 
    const parts = key.split('/');

    // 1) Restore the consenter email portion from the object key:
    let emailParts = parts[0].split('(at)');
    const consenterEmail = `${decode(emailParts[0])}@${decode(emailParts[1])}`;

    // 2) Restore the entity_id portion from the object key:
    const entityId = decode(parts[1]);
    if(parts.length < 3) {
      return { consenterEmail, entityId } as BucketItemMetadataParms;
    };

    // 3) Restore the affiliate email portion from the object key:
    emailParts = parts[2].split('(at)');
    const affiliateEmail = `${decode(emailParts[0])}@${decode(emailParts[1])}`;
    if(parts.length < 4) {
      return { consenterEmail, entityId, affiliateEmail } as BucketItemMetadataParms;
    }

    // 4) Restore the 'CORRECTED' portion from the object key if indicated:
    const correction = parts[3] == 'CORRECTED';
    const name = (correction ? parts[4] : parts[3]).replace(/\.pdf$/, '').replace(/\!/g, ':');
    const itemType = name.substring(0, name.indexOf('-')) as ItemType;
    const isoStr = name.substring(name.indexOf('-')+1, name.length)

    // 5) Restore the file name itself from the object key:
    const savedDate = new Date(isoStr);

    // 6) Return the restored metadata object:
    return { itemType, consenterEmail, affiliateEmail, entityId, correction, savedDate };
  }

}