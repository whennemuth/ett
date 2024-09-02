import { ListObjectsOutput } from "@aws-sdk/client-s3";
import { ExhibitBucket } from "./ConsenterBucketItems";


export type SingleExhibitFormMetadata = {
  entityId: string,
  affiliateEmail?: string,
  correction?: boolean,
  savedDate?: Date
};

export type ExhibitBucketItemMetadata = SingleExhibitFormMetadata & {
  consenterEmail: string,
}

/**
 * This class deals with naming convention for single exhibit forms that are to be stored in an s3 bucket.
 * The name must reflect the consenter, entity, affiliate, correction status, and saved date. These elements
 * of the name are referred to as "metadata" and are combined to form an s3 object key for the pdf file and
 * make for a rudimentary basis for querying the right file(s) out of the bucket when they need to be retrieved. 
 */
export class BucketItemMetadata {
  private bucket:ExhibitBucket;

  constructor(bucket:ExhibitBucket) {
    this.bucket = bucket;
  }

  /**
   * Get a list of exhibit forms from a query against the s3 bucket. Matches are those s3 objects
   * whose keys are reflect the metadata. Metadata that is specific to the saved date will always 
   * return just one item, while metadata specific only to the consenter email may return many items. 
   * @param metadata 
   * @returns 
   */
  public listEach = async (metadata:SingleExhibitFormMetadata): Promise<SingleExhibitFormMetadata[]> => {
    const { entityId, affiliateEmail, savedDate } = metadata;
    const { bucket } = this;

    if( ! entityId) return [];

    if(affiliateEmail && savedDate) {
      return [metadata];
    }

    const output:ListObjectsOutput = await bucket.listObjects(metadata);
    const { Contents } = output;
    if( ! Contents || Contents.length === 0) {
      return [];
    }
    const exhibitForms = Contents.map(s3Object => {
      const { Key } = s3Object;
      return Key ? BucketItemMetadata.fromBucketObjectKey(Key) : undefined;
    }).filter(metadata => { return metadata != undefined; }) as SingleExhibitFormMetadata[];

    return exhibitForms;
  }

  /**
   * Get the metadata for a specific single exhibit form in s3.
   * @param metadata Will usually be specific enough to identify a specific object in s3, but may indicate
   * the original single exhibit form AND all of its corrections. If the latter is the case, the metadata for
   * the most recent correction is returned.
   * @returns The s3 object key of the found item recomposed into a javascript object
   */
  public getLatest = async (metadata:SingleExhibitFormMetadata|string): Promise<SingleExhibitFormMetadata|undefined> => {
    if(typeof metadata == 'string') {
      // metadata is in the form of an s3 object key, so convert it to a metadata object.
      metadata = BucketItemMetadata.fromBucketObjectKey(metadata);
    }

    const { entityId, affiliateEmail } = metadata;
    
    if( ! entityId) {
      console.log(`Invalid parameters for single exhibit form lookup in s3, entity_id missing: ${JSON.stringify(metadata, null, 2)}`);
      return undefined;
    }

    if( ! affiliateEmail) {
      console.log(`Invalid parameters for single exhibit form lookup in s3, affiliateEmail missing: ${JSON.stringify(metadata, null, 2)}`);
      return undefined;
    }

    const forms = await this.listEach(metadata);
    const form:SingleExhibitFormMetadata = forms.reduce((survingForm:SingleExhibitFormMetadata, currentForm:SingleExhibitFormMetadata):SingleExhibitFormMetadata => {
      if( ! survingForm) {
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
    });
    return form;
  }

  /**
   * Find the one single exhibit form in s3 that reflects the specified consenter, entity, and affiliate email
   * in its name, and return the most recent correction if any exist, else return the most recent of what remains.
   * @param metadata 
   * @returns The s3 object key of the found item
   */
  public getLatestS3ObjectKey = async (metadata:SingleExhibitFormMetadata): Promise<string|undefined> => {
    const { bucket: { Consenter: { email:consenterEmail } }, getLatest } = this;
    const output = await getLatest(metadata);
    if( ! output) {
      return undefined;
    }
    const { entityId, affiliateEmail, correction, savedDate} = output;
    const s3ObjectKey = BucketItemMetadata.toBucketObjectKey({
      consenterEmail, entityId, affiliateEmail, correction, savedDate
    });
    if( ! (s3ObjectKey ?? '').toLowerCase().endsWith('.pdf')) {
      return undefined;
    }
    return s3ObjectKey;
  }  


  
  /**
   * Convert a consenters single exhibit form metadata into an s3 object key.
   * @param metadata 
   * @returns 
   */
  public static toBucketObjectKey = (metadata:ExhibitBucketItemMetadata):string => {
    const { consenterEmail, affiliateEmail, entityId, correction, savedDate=(new Date()) } = metadata;

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
      `${key}/CORRECTED/${getSafeIsoDate()}.pdf` : 
      `${key}/${getSafeIsoDate()}.pdf`;
  }

  /**
   * Convert an s3 object key that represents storage of a single exhibit form into the corresponding metadata.
   * @param key 
   * @returns 
   */
  public static fromBucketObjectKey = (key:string):ExhibitBucketItemMetadata => {

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
      return { consenterEmail, entityId }
    };

    // 3) Restore the affiliate email portion from the object key:
    emailParts = parts[2].split('(at)');
    const affiliateEmail = `${decode(emailParts[0])}@${decode(emailParts[1])}`;
    if(parts.length < 4) {
      return { consenterEmail, entityId, affiliateEmail }
    }

    // 4) Restore the 'CORRECTED' portion from the object key if indicated:
    const correction = parts[3] == 'CORRECTED';
    const isoStr = (correction ? parts[4] : parts[3]).replace(/\.pdf$/, '').replace(/\!/g, ':');

    // 5) Restore the file name itself from the object key: 
    const savedDate = new Date(isoStr);

    // 6) Return the restored metadata object:
    return { consenterEmail, affiliateEmail, entityId, correction, savedDate };
  }

}