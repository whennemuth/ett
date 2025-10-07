import { BucketItemMetadata, BucketItemMetadataParms, ItemType } from "./BucketItemMetadata";

const defaultISOString = '2024-09-09T20:48:32.162Z';
const safeDefaultISOString = defaultISOString.replace(/\:/g, '!');
const testISOString = '2024-08-08T20:48:32.162Z';
const safeTestISOString = testISOString.replace(/\:/g, '!');
const { EXHIBIT, CORRECTION_FORM } = ItemType;
const testdate = new Date(testISOString);
const { fromBucketObjectKey, toBucketFileKey, toBucketFolderKey } = BucketItemMetadata;
Date.now = () => { return new Date(defaultISOString).getTime(); }
process.env.REGION = 'us-east-2';

const performStardardAssert = (parsed:BucketItemMetadataParms, unparsedFile:string, unparsedFolder:string) => {
  it(`Should produce the expected s3 object key from specified metadata`, () => {
    const expected = {
      consenterEmail: parsed.consenterEmail,
    } as BucketItemMetadataParms;
    if(parsed.entityId && parsed.entityId != 'all') {
      expected.entityId = parsed.entityId;
    }
    if(parsed.affiliateEmail) {
      expected.affiliateEmail = parsed.affiliateEmail;
    }

    let _parsed = fromBucketObjectKey(unparsedFile);
    expect(_parsed).toMatchObject(expected);

    // Expect the parsed result to match the expected parsed object with the file-specific properties removed.
    _parsed = fromBucketObjectKey(unparsedFolder);
    expect(_parsed).toMatchObject(expected);
  });

  it(`Should produce the expected metadata from the provided s3 object key:`, () => {
    let _unparsed = toBucketFileKey(parsed);
    expect(_unparsed).toEqual(unparsedFile);
    _unparsed = toBucketFolderKey(parsed);
    expect(_unparsed).toEqual(unparsedFolder);
  });
}

describe('ConsenterBucketItems test case 1', () => {
  const unparsedFolder = `bugs.bunny(at)warnerbros.com/6dc70eb2-16b4-4b29-abe6-4ecb5eafd01c/daffy-duck(at)warnerbros.com`;
  const unparsedFile = `${unparsedFolder}/${EXHIBIT}-${safeTestISOString}.pdf`;
  const parsed = {
    itemType: EXHIBIT,
    consenterEmail: 'bugs.bunny@warnerbros.com',
    entityId: '6dc70eb2-16b4-4b29-abe6-4ecb5eafd01c',
    affiliateEmail: 'daffy-duck@warnerbros.com',
    correction: false,
    savedDate: testdate
  } as BucketItemMetadataParms;

  performStardardAssert(parsed, unparsedFile, unparsedFolder);
});

describe('ConsenterBucketItems test case 2', () => {
  const unparsedFolder = `bugs(at)warnerbros.com/entity1/daffy-duck(at)warnerbros.com/CORRECTED`;
  const unparsedFile = `${unparsedFolder}/${EXHIBIT}-${safeTestISOString}.pdf`;
  const parsed = {
    itemType: EXHIBIT,
    consenterEmail: 'bugs@warnerbros.com',
    entityId: 'entity1',
    affiliateEmail: 'daffy-duck@warnerbros.com',
    correction: true,
    savedDate: testdate
  };

  performStardardAssert(parsed, unparsedFile, unparsedFolder);
});

describe('ConsenterBucketItems test case 3', () => {
  const unparsedFolder = `bugs(at)warnerbros.com/entity1/daffy-duck(at)warnerbros.com`;
  const unparsedFile = `${unparsedFolder}/${EXHIBIT}-${safeDefaultISOString}.pdf`;
  const parsed = {
    itemType: EXHIBIT,
    consenterEmail: 'bugs@warnerbros.com',
    entityId: 'entity1',
    affiliateEmail: 'daffy-duck@warnerbros.com',
    correction: false
  };

  performStardardAssert(parsed, unparsedFile, unparsedFolder);
});

describe('ConsenterBucketItems test case 4', () => {
  const unparsedFolder = `(pct)26(pct)23(pct)24*(pct)26__(at)some.(pct)23(pct)26(pct)5E.com/*(pct)40(pct)26(pct)24)(pct)3D00/(pct)24((pct)25(pct)26(at)(pct)26)(pct)24*(pct)23(pct)40*(pct)26)(pct)26)).com`;
  const unparsedFile = `${unparsedFolder}/${EXHIBIT}-${safeDefaultISOString}.pdf`;
  const parsed = {
    itemType: EXHIBIT,
    consenterEmail: '&#$*&__@some.#&^.com',
    entityId: '*@&$)=00',
    affiliateEmail: '$(%&@&)$*#@*&)&)).com',
    correction: false
  };

  performStardardAssert(parsed, unparsedFile, unparsedFolder);
});

describe('ConsenterBucketItems test case 5', () => {
  const unparsedFolder = `bugs(at)warnerbros.com/entity1/daffy-duck(at)warnerbros.com`;
  const unparsedFile = `${unparsedFolder}/${EXHIBIT}-${safeDefaultISOString}.pdf`;
  const parsed = {
    itemType: EXHIBIT,
    consenterEmail: 'bugs@warnerbros.com',
    entityId: 'entity1',
    affiliateEmail: 'daffy-duck@warnerbros.com' 
  };

  performStardardAssert(parsed, unparsedFile, unparsedFolder);
});

describe('ConsenterBucketItems test case 6', () => {
  const unparsedFolder = 'bugs(at)warnerbros.com/entity1';
  const unparsedFile = `${unparsedFolder}/daffy-duck(at)warnerbros.com/${EXHIBIT}-${safeDefaultISOString}.pdf`;
  const parsed = {
    consenterEmail: 'bugs@warnerbros.com',
    entityId: 'entity1',
  } as BucketItemMetadataParms;

  it(`Should produce the expected s3 object key from specified metadata`, () => {
    let _parsed = fromBucketObjectKey(unparsedFolder);
    expect(_parsed).toMatchObject(parsed); 
  });

  it(`Should produce the expected metadata from the provided s3 object key:`, () => {
    let _unparsed = toBucketFolderKey(parsed);
    expect(_unparsed).toEqual(unparsedFolder);

    expect(() => {
      toBucketFileKey(parsed);
    }).toThrow(/^Provided metadata cannot specify a file without affiliateEmail/);

    let reparsed = Object.assign({ affiliateEmail: 'daffy-duck@warnerbros.com' }, parsed);

    expect(() => {
      toBucketFileKey(reparsed);
    }).toThrow(/^Provided metadata cannot specify a file without itemType/);

    reparsed = Object.assign({ itemType: ItemType.EXHIBIT }, reparsed);
    _unparsed = toBucketFileKey(reparsed);
    expect(_unparsed).toEqual(unparsedFile);
  });
});

describe('ConsenterBucketItems test case 7', () => {
  const unparsedFolder = 'bugs(at)warnerbros.com';
  const unparsedFile = `${unparsedFolder}/${CORRECTION_FORM}-${safeDefaultISOString}.pdf`;
  const parsed = {
    itemType: CORRECTION_FORM,
    consenterEmail: 'bugs@warnerbros.com',
  } as BucketItemMetadataParms;

  performStardardAssert(parsed, unparsedFile, unparsedFolder);

  parsed.entityId = 'all';

  performStardardAssert(parsed, unparsedFile, unparsedFolder);
});