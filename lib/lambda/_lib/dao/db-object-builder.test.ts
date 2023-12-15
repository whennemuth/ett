import { ConvertObjectFilter, convertToApiObject, convertFromApiObject } from './db-object-builder';

const bigInput = {
  name: 'Daffy Duck',
  ate: {
    today: [
      { meal: 'breakfast', menu: 'eggs & bacon' },
      { meal: 'lunch', menu: 'tuna sandwich' },
      { 
        meal: 'dinner', 
        menu: {
          main: 'spagetti',
          desert: 'icecream'
        }
      }
    ],
    yesterday: [
      { meal: 'breakfast', menu: 'cornflakes' },
      { meal: 'lunch', menu: 'hamburger & fries' },
      { 
        meal: 'dinner', 
        menu: {
          main: 'chef salad',
          desert: 'cheesecake'
        }
      }
    ]
  }
};

const expectedBigOutput = {
  "name": {
    "S": "Daffy Duck"
  },
  "ate": {
    "M": {
      "today": {
        "L": [
          {
            "M": {
              "meal": {
                "S": "breakfast"
              },
              "menu": {
                "S": "eggs & bacon"
              }
            }
          },
          {
            "M": {
              "meal": {
                "S": "lunch"
              },
              "menu": {
                "S": "tuna sandwich"
              }
            }
          },
          {
            "M": {
              "meal": {
                "S": "dinner"
              },
              "menu": {
                "M": {
                  "main": {
                    "S": "spagetti"
                  },
                  "desert": {
                    "S": "icecream"
                  }
                }
              }
            }
          }
        ]
      },
      "yesterday": {
        "L": [
          {
            "M": {
              "meal": {
                "S": "breakfast"
              },
              "menu": {
                "S": "cornflakes"
              }
            }
          },
          {
            "M": {
              "meal": {
                "S": "lunch"
              },
              "menu": {
                "S": "hamburger & fries"
              }
            }
          },
          {
            "M": {
              "meal": {
                "S": "dinner"
              },
              "menu": {
                "M": {
                  "main": {
                    "S": "chef salad"
                  },
                  "desert": {
                    "S": "cheesecake"
                  }
                }
              }
            }
          }
        ]
      }
    }
  }
}

let jestTest = true;
process.argv.forEach((a) => { if(a === 'non-jest') jestTest = false; });

if(jestTest) {

  describe('convertToApiObject', () => {

    it('Should output expected result for simple object with string property', () => {
      const output = convertToApiObject({ fld: 'fld-value' });
      expect(output).toEqual({ fld: { S: 'fld-value' }});
    });

    it('Should output expected result for simple object with integer property', () => {
      const output = convertToApiObject({ fld: 6 });
      expect(output).toEqual({ fld: { N: 6 }});
    });

    it('Should output expected result for simple object with bigint property', () => {
      const output = convertToApiObject({ fld: BigInt("0x1fffffffffffff") });
      expect(output).toEqual({ fld: { N: 9007199254740991n }});
    });

    it('Should output expected result for simple object with boolean true property', () => {
      const output = convertToApiObject({ fld: true });
      expect(output).toEqual({ fld: { BOOL: true }});
    });

    it('Should output expected result for simple object with boolean false property', () => {
      const output = convertToApiObject({ fld: false });
      expect(output).toEqual({ fld: { BOOL: false }});
    });

    it('Should ignore null fields if not told otherwise', () => {
      const output = convertToApiObject({ fld: null });
      expect(output).toEqual({});
    });

    it('Should output expected result for simple object with null property if configured to', () => {
      const output = convertToApiObject({ fld: null }, { setNull: true });
      expect(output).toEqual({ fld: { NULL: true }});
    });

    it('Should output expected result for simple object with undefined property if configured to', () => {
      const output = convertToApiObject({ fld: undefined }, { setNull: true });
      expect(output).toEqual({ fld: { NULL: true }});
    });

    it('Should exclude a field if configured to do so', () => {
      let output = convertToApiObject({ includedFld: 'included', excludedFld: 'excluded' }, { exclude:['excludedFld'] });
      expect(output).toEqual({ includedFld: { S: 'included' }});
    });

    it('Should include fields only found in the include list if provided', () => {
      const input = {
        fld1: 'exclude 1',
        fld2: 'include 2',
        fld3: 'include 3',
        fld4: 'exclude 4'
      };
      const expectedOutput = {
        fld2: { S: 'include 2'},
        fld3: { S: 'include 3'}
      };
      const output = convertToApiObject(input, { include: [ 'fld2', 'fld3' ]});
      expect(output).toEqual(expectedOutput);
    });

    it('Should output expected result for complex object', () => {
      let output = convertToApiObject(bigInput);
      expect(output).toEqual(expectedBigOutput);
    });
  });

  describe('convertFromApiObject', () => {

    it('Should output expected result for simple object with string property', () => {
      const output = convertFromApiObject({ fld: { S: 'fld-value' }});
      expect(output).toEqual({ fld: 'fld-value' });
    });

    it('Should output expected result for simple object with a date property', () => {
      const d = new Date();
      const output = convertFromApiObject({ fld: { S: d.toISOString() }});
      expect(output).toEqual({ fld: d });
    });

    it('Should output expected result for simple object with integer property', () => {
      const output = convertFromApiObject({ fld: { N: 6 }});
      expect(output).toEqual({ fld: 6 });
    });

    it('Should output expected result for simple object with bigint property', () => {
      let output = convertFromApiObject({ fld: { N: 9007199254740991n }});
      expect(output).toEqual({ fld: 9007199254740991 });
      output = convertFromApiObject({ fld: { N: 9007199254740991 }});
      expect(output).toEqual({ fld: 9007199254740991 });
    });

    it('Should output expected result for simple object with boolean true property', () => {
      const output = convertFromApiObject({ fld: { BOOL: true }});
      expect(output).toEqual({ fld: true });
    });

    it('Should output expected result for simple object with null property', () => {
      const output = convertFromApiObject({ fld: { NULL: true }});
      expect(output).toEqual({ fld: null });
    });

    it('Should output expected result for complex object', () => {
      let output = convertFromApiObject(expectedBigOutput);
      expect(output).toEqual(bigInput);
    })
  })
}
else {
  // Jest can take a while to load up, so for much quicker turn-around during non unit test trial and error
  // sessions, use this instead.
  let task:'convert'|'restore'|undefined;

  process.argv.forEach((a) => { 
    if(a.toLocaleLowerCase() === 'convert') task = 'convert';
    else if(a.toLocaleLowerCase() === 'restore') task = 'restore';
  });

  switch(task) {
    case 'convert':
      console.log(JSON.stringify(convertToApiObject(bigInput), null, 2));
      break;
    case 'restore':
      console.log(JSON.stringify(convertFromApiObject(expectedBigOutput), null, 2));
      break;
    default:
      console.log('Insufficient parameters: failed to specify "convert" or "restore"');
      break;
  }
  
}
