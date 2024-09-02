import { BucketItemMetadata, ExhibitBucketItemMetadata } from "./ConsenterBucketItemMetadata";

const testISOString = '2024-08-08T20:48:32.162Z'
const safeISOString = testISOString.replace(/\:/g, '!');
const testdate = new Date(testISOString);
Date.prototype.toISOString = () => { return testISOString; }
const assertions: { [key: string]: ExhibitBucketItemMetadata } = {
  [`bugs.bunny(at)warnerbros.com/6dc70eb2-16b4-4b29-abe6-4ecb5eafd01c/daffy-duck(at)warnerbros.com/${safeISOString}.pdf`]: {
    consenterEmail: 'bugs.bunny@warnerbros.com',
    entityId: '6dc70eb2-16b4-4b29-abe6-4ecb5eafd01c',
    affiliateEmail: 'daffy-duck@warnerbros.com',
    correction: false,
    savedDate: testdate
  },
  [`bugs(at)warnerbros.com/entity1/daffy-duck(at)warnerbros.com/CORRECTED/${safeISOString}.pdf`]: {
    consenterEmail: 'bugs@warnerbros.com',
    entityId: 'entity1',
    affiliateEmail: 'daffy-duck@warnerbros.com',
    correction: true,
    savedDate: testdate
  },
  [`bugs(at)warnerbros.com/entity1/daffy-duck(at)warnerbros.com/${safeISOString}.pdf`]: {
    consenterEmail: 'bugs@warnerbros.com',
    entityId: 'entity1',
    affiliateEmail: 'daffy-duck@warnerbros.com',
    correction: false
  },
  [`(pct)26(pct)23(pct)24*(pct)26__(at)some.(pct)23(pct)26(pct)5E.com/*(pct)40(pct)26(pct)24)(pct)3D00/(pct)24((pct)25(pct)26(at)(pct)26)(pct)24*(pct)23(pct)40*(pct)26)(pct)26)).com/${safeISOString}.pdf`]: {
    consenterEmail: '&#$*&__@some.#&^.com',
    entityId: '*@&$)=00',
    affiliateEmail: '$(%&@&)$*#@*&)&)).com',
    correction: false
  },
  [`bugs(at)warnerbros.com/entity1`]: {
    consenterEmail: 'bugs@warnerbros.com',
    entityId: 'entity1',
  },
  [`bugs(at)warnerbros.com/entity1/daffy-duck(at)warnerbros.com`]: {
    consenterEmail: 'bugs@warnerbros.com',
    entityId: 'entity1',
    affiliateEmail: 'daffy-duck@warnerbros.com' 
  },
};

describe('ConsenterBucketItems.toBucketItemPath()', () => {
  let counter = 1;
  for(let expectedObjectKey in assertions) {
    if (assertions.hasOwnProperty(expectedObjectKey)) {
      const metadata = assertions[expectedObjectKey];
      const key = BucketItemMetadata.toBucketObjectKey(metadata);
      it(`Should produce the expected s3 object key from specified metadata: ${counter++}`, () => {
        if(expectedObjectKey == `bugs(at)warnerbros.com/entity1/daffy-duck(at)warnerbros.com`) {
          // In this one case, the key represents only part of the expected value (it is missing the file name)
          expectedObjectKey = `${expectedObjectKey}/${safeISOString}.pdf`
        }
        expect(key).toEqual(expectedObjectKey);
      })
    }
  }
});

describe('ConsenterBucketItems.fromBucketItemPath()', () => {
  let counter = 1;
  for(const key in assertions) {
    if(assertions.hasOwnProperty(key)) {
      const expectedMetadata = assertions[key];
      const metadata = BucketItemMetadata.fromBucketObjectKey(key);
      const getClone = (metadata:ExhibitBucketItemMetadata) => {
        const { affiliateEmail, consenterEmail, correction, entityId, savedDate } = metadata;
        if( ! affiliateEmail) {
          return { consenterEmail, entityId };
        }
        if( correction == undefined && ! savedDate) {
          return { consenterEmail, entityId, affiliateEmail }
        }
        return {
          affiliateEmail, consenterEmail, correction, entityId, savedDate: (savedDate ?? testdate)
        };
      }
      it(`Should produce the expected metadata from the provided s3 object key: ${counter++}`, () => {
        const _expectedMetadata = getClone(expectedMetadata) as ExhibitBucketItemMetadata;
        expect(metadata).toEqual(_expectedMetadata);
      });
    }
  }
});