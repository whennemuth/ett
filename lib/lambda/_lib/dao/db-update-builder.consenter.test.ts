import { AttributeValue, UpdateItemCommandInput } from '@aws-sdk/client-dynamodb';
import { DynamoDbConstruct, TableBaseNames } from '../../../DynamoDb';
import { deepEqual } from '../../Utils';
import { consenterUpdate } from './db-update-builder.consenter';
import { Affiliate, AffiliateTypes, Consenter, ConsenterFields, ExhibitForm, ExhibitFormFields } from './entity';

describe('getCommandInputBuilderForConsenterUpdate', () => {

  const { email, firstname, middlename, lastname, phone_number, sub, title, exhibit_forms, update_timestamp } = ConsenterFields;

  const isoString = new Date().toISOString();
  Date.prototype.toISOString = () => { return isoString; };
  const { getTableName } = DynamoDbConstruct;
  const { CONSENTERS } = TableBaseNames;
  const TableName = getTableName(CONSENTERS);
  const daffyEmail = 'daffyduck@warnerbros.com';

  const getOldConsenter = ():Consenter => {
    return{
      email: daffyEmail,
      firstname: 'Daffy',
      middlename: 'D',
      lastname: 'Duck',
      title: 'Aquatic Fowl',
      phone_number: '781-444-6666',
      create_timestamp: isoString,
    } as Consenter;
  }

  const getNewConsenter = () => {
    const { firstname, lastname, phone_number } = getOldConsenter();
    return {
      email: daffyEmail,
      firstname,
      lastname,    
      title: 'Director of Animation',
      phone_number,
      sub: 'abc123'
    } as Consenter;
  }

  const getExhibitForm = (idx:number, api:boolean=false): any => {
    if(api) {
      return {
        M: {
          entity_id: { S: `id${idx}` },
          create_timestamp: { S: isoString } 
        }
      }
    }
    return {
      entity_id: `id${idx}`,
      create_timestamp: isoString
    } as ExhibitForm;
  }

  const getBugsBunny = (api:boolean=false):any => {
    if(api) {
      return { M: { 
        affiliateType: { S: AffiliateTypes.ACADEMIC }, 
        email: { S: 'bugs@warnerbros.com' }, 
        fullname: { S: 'Bugs Bunny' },
        org: { S: 'Looney Tunes' },
        phone_number: { S: '617-222-4444' },
        title: { S: 'Rabbit' }
      }};
    }
    return {
      affiliateType: AffiliateTypes.ACADEMIC,
      email: 'bugs@warnerbros.com',
      fullname: 'Bugs Bunny',
      org: 'Looney Tunes',
      phone_number: '617-222-4444',
      title: 'Rabbit'
    } as Affiliate;
  }

  const getYosemiteSam = (api:boolean=false):any => {
    if(api) {
      return { M: { 
        affiliateType: { S: AffiliateTypes.EMPLOYER }, 
        email: { S: 'yosemite@warnerbros.com' }, 
        fullname: { S: 'Yosemite Sam' },
        org: { S: 'Looney Tunes' },
        phone_number: { S: '781-333-5555' },
        title: { S: 'Cowboy' }
      }};
    }
    return {
      affiliateType: AffiliateTypes.EMPLOYER,
      email: 'yosemite@warnerbros.com',
      fullname: 'Yosemite Sam',
      org: 'Looney Tunes',
      phone_number: '781-333-5555',
      title: 'Cowboy'
    } as Affiliate;
  }

  const getFoghornLeghorn = (api:boolean=false):any => {
    if(api) {
      return { M: { 
        affiliateType: { S: AffiliateTypes.OTHER }, 
        email: { S: 'forhorn@warnerbros.com' }, 
        fullname: { S: 'Foghorn Leghorn' },
        org: { S: 'Looney Tunes' },
        phone_number: { S: '508-444-6666' },
        title: { S: 'Rooster' }
      }};
    }
    return {
      affiliateType: AffiliateTypes.OTHER,
      email: 'forhorn@warnerbros.com',
      fullname: 'Foghorn Leghorn',
      org: 'Looney Tunes',
      phone_number: '508-444-6666',
      title: 'Rooster'
    } as Affiliate;
  }

  /**
   * Two UpdateItemCommandInput will be expected to be equal if their equality includes the same exhibit_form
   * list content. However, if the two lists do not contain their mutual items in the same order, equality 
   * between the two UpdateItemCommandInput objects will be false, according to assert.deepEqual. So, to get
   * around this, the exhibit_forms and exhibit_forms[n].affiliates are sorted so they share the same order.
   * @param input1 
   * @param input2 
   * @param parm 
   * @returns 
   */
  const deepEquivalent = (input1:UpdateItemCommandInput, input2:UpdateItemCommandInput, parm?:'log.console'|'log.temp'|'alt'):boolean => {
    /**
     * Sort the exhibit forms by entity_id and affiliates by email
     * @param input 
     */
    const sortConsenterInternalItems = (input:UpdateItemCommandInput) => {
      const { ExpressionAttributeValues:vals } = input;

      // Sort the exhibit forms within the consenter
      vals?.[':exhibit_forms']?.L?.sort((ef1:AttributeValue, ef2:AttributeValue) => {
        const entityId1 = `${ef1.M?.[ExhibitFormFields.entity_id].S}`;
        const entityId2 = `${ef2.M?.[ExhibitFormFields.entity_id].S}`;
        if(entityId1 == entityId2) return 0;
        return entityId1 > entityId2 ? 1 : -1;
      });

      // Sort the affiliate within each exhibit form
      vals?.[':exhibit_forms']?.L?.forEach((ef:any) => {
        ef?.affiliates?.L.sort((a1:AttributeValue, a2:AttributeValue) => {
          const email1 = `${a1.M?.email.S}`;
          const email2 = `${a2.M?.email.S}`;
          if(email1 == email2) return 0;
          return email1 > email2 ? 1 : -1;
        });
      });
    }

    sortConsenterInternalItems(input1);
    sortConsenterInternalItems(input2);

    return deepEqual(input1, input2, parm);
  }

  it('Should produce the expected command input for non-exhibit update', () => {
    const newConsenter = getNewConsenter();
    const oldConsenter = getOldConsenter();
    const input = consenterUpdate(TableName, newConsenter, oldConsenter).buildUpdateItemCommandInput() as UpdateItemCommandInput;

    const expectedOutput = {
      TableName,
      Key: { [email]: { S: daffyEmail }},
      ExpressionAttributeNames: {        
        ["#sub"]: sub,
        ["#title"]: title,
        ["#update_timestamp"]: update_timestamp,
      },
      ExpressionAttributeValues: {
        [":sub"]: { "S": newConsenter.sub },
        [":title"]: { "S": newConsenter.title },
        [":update_timestamp"]: { "S": isoString },
      },
      // NOTE: fields will be set in the same order as they appear in the entity.ConsenterFields
      UpdateExpression: `SET #sub = :sub, #title = :title, #update_timestamp = :update_timestamp`
    } as UpdateItemCommandInput;

    expect(deepEquivalent(input, expectedOutput)).toBe(true);
  });

  it('Should produce the expected command input for exhibit append: no append', () => {
    // Get a consenter that has no changes
    const oldConsenter = getOldConsenter();
    const ef1 = getExhibitForm(1);
    const ef2 = getExhibitForm(2);
    const ef3 = getExhibitForm(1);
    const ef4 = getExhibitForm(2);
    
    // These two consenters should be identical
    oldConsenter.exhibit_forms = [
      Object.assign(ef1, { affiliates: [ getBugsBunny(), getYosemiteSam() ]}),
      Object.assign(ef2, { affiliates: [ getYosemiteSam(), getFoghornLeghorn() ]})
    ];
    const newConsenter = Object.assign({}, oldConsenter);
    newConsenter.exhibit_forms = [
      Object.assign(ef3, { affiliates: [ getBugsBunny(), getYosemiteSam() ]}),
      Object.assign(ef4, { affiliates: [ getYosemiteSam(), getFoghornLeghorn() ]})
    ];
    
    const input = consenterUpdate(TableName, newConsenter, oldConsenter).buildUpdateItemCommandInput() as UpdateItemCommandInput;

    expect(input).toEqual([]);
  });

  it('Should produce the expected command input for exhibit append: single append', () => {
    const oldConsenter = getOldConsenter();
    // Get a consenter with an update that includes a new exhibit form
    const newConsenter = getOldConsenter();
    newConsenter.exhibit_forms = [ getExhibitForm(1) ]

    // Run the builder and assert that only a SET of exhibit_form is reflected in the result.
    const input = consenterUpdate(TableName, newConsenter, oldConsenter).buildUpdateItemCommandInput() as UpdateItemCommandInput;

    const expectedOutput = {
      TableName,
      Key: { [email]: { S: daffyEmail }},
      ExpressionAttributeNames: {        
        ["#update_timestamp"]: update_timestamp,
        ["#exhibit_forms"]: exhibit_forms,
      },
      ExpressionAttributeValues: {
        [":update_timestamp"]: { S: isoString },
        [":exhibit_forms"]: { L: [ getExhibitForm(1, true) ] },
      },
      // NOTE: fields will be set in the same order as they appear in the entity.ConsenterFields
      UpdateExpression: `SET #update_timestamp = :update_timestamp, #exhibit_forms = :exhibit_forms`
    } as UpdateItemCommandInput;

    expect(deepEquivalent(input, expectedOutput)).toBe(true);
  });

  it('Should produce the expected command input for exhibit appends: multiple append', () => {
    const oldConsenter = getOldConsenter();
    // Get a consenter with an update that includes a new exhibit form
    const newConsenter = getOldConsenter();
    newConsenter.exhibit_forms = [ getExhibitForm(1), getExhibitForm(2), getExhibitForm(3) ]

    // Run the builder and assert that only a SET of exhibit_form is reflected in the result.
    const input = consenterUpdate(TableName, newConsenter, oldConsenter).buildUpdateItemCommandInput() as UpdateItemCommandInput;

    const expectedOutput = {
      TableName,
      Key: { [email]: { S: daffyEmail }},
      ExpressionAttributeNames: {        
        ["#update_timestamp"]: update_timestamp,
        ["#exhibit_forms"]: exhibit_forms,
      },
      ExpressionAttributeValues: {
        [":update_timestamp"]: { S: isoString },
        [":exhibit_forms"]: { L: [ getExhibitForm(1, true), getExhibitForm(2, true), getExhibitForm(3, true) ] },
      },
      UpdateExpression: `SET #update_timestamp = :update_timestamp, #exhibit_forms = :exhibit_forms`
    } as UpdateItemCommandInput;

    expect(deepEquivalent(input, expectedOutput)).toBe(true);
  });

  it('Should produce the expected command input for exhibit append: append with affiliates', () => {
    const oldConsenter = getOldConsenter();
    // Get a consenter with an update that includes a new exhibit form with affiliates
    const newConsenter = getOldConsenter();
    newConsenter.exhibit_forms = [ Object.assign(getExhibitForm(1), { affiliates: [ getBugsBunny(), getYosemiteSam() ]}) ]

    // Run the builder and assert that only a SET of exhibit_form is reflected in the result.
    const input = consenterUpdate(TableName, newConsenter, oldConsenter).buildUpdateItemCommandInput() as UpdateItemCommandInput;

    const efApi1 = getExhibitForm(1, true);
    (efApi1 as any).M.affiliates = { L: [ getBugsBunny(true), getYosemiteSam(true) ] };
    const expectedOutput = {
      TableName,
      Key: { [email]: { S: daffyEmail }},
      ExpressionAttributeNames: {        
        ["#update_timestamp"]: update_timestamp,
        ["#exhibit_forms"]: exhibit_forms,
      },
      ExpressionAttributeValues: {
        [":update_timestamp"]: { S: isoString },
        [":exhibit_forms"]: { L: [ efApi1 ] },
      },
      UpdateExpression: `SET #update_timestamp = :update_timestamp, #exhibit_forms = :exhibit_forms`
    } as UpdateItemCommandInput;

    expect(deepEquivalent(input, expectedOutput)).toBe(true);
  });

  it('Should produce the expected command input for exhibit update', () => {
    // Clone the consenter (original and modified)
    const newConsenter = getOldConsenter();
    const oldConsenter = getOldConsenter();
    const ef1 = getExhibitForm(1);
    const ef2 = getExhibitForm(2);
    const ef3 = getExhibitForm(1);
    const ef4 = getExhibitForm(2);
    
    // Add exhibit forms to the original consenter.
    ef1.affiliates = [ getBugsBunny(), getYosemiteSam() ];
    ef2.affiliates = [ getYosemiteSam(), getFoghornLeghorn() ];
    oldConsenter.exhibit_forms = [ ef1, ef2 ];
    
    // Add the same exhibit forms to the modified consenter with changes to sent_timestamp and one of the affiliates
    ef3.affiliates = [ getBugsBunny(), getYosemiteSam() ];
    ef4.affiliates = [ getYosemiteSam(), getFoghornLeghorn() ];
    ef3.sent_timestamp = `${new Date().toISOString()}`;
    ef4.affiliates[0].fullname = 'Yosemite S Sam';
    newConsenter.exhibit_forms = [ ef3, ef4 ];
    
    // Build the command input
    const input = consenterUpdate(TableName, newConsenter, oldConsenter).buildUpdateItemCommandInput() as UpdateItemCommandInput;

    // Build a command input that is expected to match
    const efApi1 = getExhibitForm(1, true);
    const efApi2 = getExhibitForm(2, true);
    const modifiedSamsApi = getYosemiteSam(true);
    modifiedSamsApi.M.fullname.S = 'Yosemite S Sam';
    (efApi1.M as any).sent_timestamp = { S: newConsenter.exhibit_forms[0].sent_timestamp };
    (efApi1.M as any).affiliates = { L: [ getBugsBunny(true), getYosemiteSam(true) ] };
    (efApi2.M as any).affiliates = { L: [ modifiedSamsApi, getFoghornLeghorn(true) ] };
    const expectedOutput = {
      TableName,
      Key: { [email]: { S: daffyEmail }},
      ExpressionAttributeNames: {        
        ["#update_timestamp"]: update_timestamp,
        ["#exhibit_forms"]: exhibit_forms,
      },
      ExpressionAttributeValues: {
        [":update_timestamp"]: { S: isoString },
        [":exhibit_forms"]: { L: [ efApi1, efApi2 ] }, 
      },
      UpdateExpression: `SET #update_timestamp = :update_timestamp, #exhibit_forms = :exhibit_forms`
    } as UpdateItemCommandInput;

    // Test for equality between command input and expected command input
    expect(deepEquivalent(input, expectedOutput)).toBe(true);
  });

  it('Should produce the expected command input for exhibit removal', () => {
    // Clone the consenter (original and modified)
    const newConsenter = getOldConsenter();
    const oldConsenter = getOldConsenter();
    const ef1 = getExhibitForm(1);
    const ef2 = getExhibitForm(2);
    const ef3 = getExhibitForm(3);
    
    // Add 3 exhibit forms to the original consenter.
    oldConsenter.exhibit_forms = [ ef1, ef2, ef3 ];

    // Build a baseline for a command input that is expected to match the output
    const efApi1 = getExhibitForm(1, true);
    const efApi2 = getExhibitForm(2, true);
    const efApi3 = getExhibitForm(3, true);
    const expectedOutput = {
      TableName,
      Key: { [email]: { S: daffyEmail }},
      ExpressionAttributeNames: {        
        ["#update_timestamp"]: update_timestamp,
        ["#exhibit_forms"]: exhibit_forms,
      },
      ExpressionAttributeValues: {
        [":update_timestamp"]: { S: isoString },
        [":exhibit_forms"]: { L: [ efApi1, efApi2, efApi3 ] }, 
      },
      UpdateExpression: 'SET #update_timestamp = :update_timestamp, #exhibit_forms = :exhibit_forms'
    } as UpdateItemCommandInput;
    
    // Add the same 3 exhibit forms to the modified consenter, except the middle one.
    newConsenter.exhibit_forms = [ ef1, ef3 ];
    // Build the command input
    let input = consenterUpdate(TableName, newConsenter, oldConsenter).buildUpdateItemCommandInput() as UpdateItemCommandInput;
    // Build a command input that is expected to match
    expectedOutput!.ExpressionAttributeValues![":exhibit_forms"] = { L: [ efApi1, efApi3 ] };
    // Test for equality between command input and expected command input
    expect(deepEquivalent(input, expectedOutput)).toBe(true);
    // Retry with "merge" set to true
    let mergeParms = { fieldName:ConsenterFields.exhibit_forms, merge:true };
    input = consenterUpdate(TableName, newConsenter, oldConsenter).buildUpdateItemCommandInput(mergeParms) as UpdateItemCommandInput;
    // Test that the output reflects the fact that an update would result in no effective changes, and so is empty.
    expect(input).toEqual([]);

    // Now remove another exhibit form
    newConsenter.exhibit_forms = [ ef3 ];    
    // Build the command input
    input = consenterUpdate(TableName, newConsenter, oldConsenter).buildUpdateItemCommandInput() as UpdateItemCommandInput;  
    // Build a command input that is expected to match
    expectedOutput!.ExpressionAttributeValues![":exhibit_forms"] = { L: [ efApi3 ] };
    // Test for equality between command input and expected command input
    expect(deepEquivalent(input, expectedOutput)).toBe(true);
    // Retry with "merge" set to true
    mergeParms = { fieldName:ConsenterFields.exhibit_forms, merge:true };
    input = consenterUpdate(TableName, newConsenter, oldConsenter).buildUpdateItemCommandInput(mergeParms) as UpdateItemCommandInput;
    // Test that the output reflects the fact that an update would result in no effective changes, and so is empty.
    expect(input).toEqual([]);

    // Now remove the last exhibit form
    newConsenter.exhibit_forms = undefined;
    // Build the command input
    input = consenterUpdate(TableName, newConsenter, oldConsenter).buildUpdateItemCommandInput() as UpdateItemCommandInput;  
    // Build a command input that is expected to match
    expectedOutput!.ExpressionAttributeValues![":exhibit_forms"] = { L: [ ] };
    // Test for equality between command input and expected command input
    expect(deepEquivalent(input, expectedOutput)).toBe(true);
    // Retry with "merge" set to true
    mergeParms = { fieldName:ConsenterFields.exhibit_forms, merge:true };
    input = consenterUpdate(TableName, newConsenter, oldConsenter).buildUpdateItemCommandInput(mergeParms) as UpdateItemCommandInput;
    // Test that the output reflects the fact that an update would result in no effective changes, and so is empty.
    expect(input).toEqual([]);
  });

  it('Should produce the expected command input for all scenarios combined', () => {
    const newConsenter = getNewConsenter();
    const oldConsenter = getOldConsenter();
    const ef1 = getExhibitForm(1);
    const ef2 = getExhibitForm(2);
    const ef3 = getExhibitForm(3);

    const ef4 = getExhibitForm(1);
    const ef5 = getExhibitForm(2);
    const ef6 = getExhibitForm(3);
    const ef7 = getExhibitForm(4);
    
    // Add exhibit forms to the original consenter.
    ef1.affiliates = [ getBugsBunny(), getYosemiteSam() ];
    ef2.affiliates = [ getYosemiteSam(), getFoghornLeghorn() ];
    ef3.affiliates = [ getBugsBunny(), getFoghornLeghorn() ]
    oldConsenter.exhibit_forms = [ ef1, ef2, ef3 ];
    
    // Add all but one of the same exhibit forms, with one of the remaining having a modified affiliate
    ef4.affiliates = [ getBugsBunny(), getYosemiteSam() ];
    ef5.affiliates = [ getYosemiteSam(), getFoghornLeghorn() ];
    ef6.affiliates = [ getBugsBunny(), getFoghornLeghorn() ];
    ef7.affiliates = [ getBugsBunny(), getYosemiteSam(), getFoghornLeghorn() ]
    ef4.affiliates[1].fullname = 'Yosemite S Sam';
    newConsenter.exhibit_forms = [ ef4, ef6, ef7 ];

    // Reflect the same modification in the expected output.
    const efApi4 = getExhibitForm(1, true);
    const efApi5 = getExhibitForm(2, true);
    const efApi6 = getExhibitForm(3, true);
    const efApi7 = getExhibitForm(4, true);
    const modifiedSamsApi = getYosemiteSam(true);
    modifiedSamsApi.M.fullname.S = 'Yosemite S Sam';
    (efApi4.M as any).affiliates = { L: [ getBugsBunny(true), modifiedSamsApi ] };
    (efApi5.M as any).affiliates = { L: [ getYosemiteSam(true), getFoghornLeghorn(true) ] };
    (efApi6.M as any).affiliates = { L: [ getBugsBunny(true), getFoghornLeghorn(true) ] };
    (efApi7.M as any).affiliates = { L: [ getBugsBunny(true), getYosemiteSam(true), getFoghornLeghorn(true) ] };

    // Build the command input
    let input = consenterUpdate(TableName, newConsenter, oldConsenter).buildUpdateItemCommandInput() as UpdateItemCommandInput;
    
    // Build a command input that is expected to match the SET operation against on of the exhibit_forms list items
    const expectedOutput = {
      TableName,
      Key: { [email]: { S: daffyEmail }},
      ExpressionAttributeNames: {        
        ["#sub"]: sub,
        ["#title"]: title,
        ["#update_timestamp"]: update_timestamp,
        ["#exhibit_forms"]: exhibit_forms,
      },
      ExpressionAttributeValues: {
        [":sub"]: { "S": newConsenter.sub },
        [":title"]: { "S": newConsenter.title },
        [":update_timestamp"]: { S: isoString },
        [":exhibit_forms"]: { L: [ efApi4, efApi6, efApi7 ] }, 
      },
      UpdateExpression: 'SET ' +
      '#sub = :sub, ' +
      '#title = :title, ' +
      '#update_timestamp = :update_timestamp, ' +
      '#exhibit_forms = :exhibit_forms'
    } as UpdateItemCommandInput;

    // Test for equality between command input and expected command input
    expect(deepEquivalent(input, expectedOutput, 'log.temp')).toBe(true);

    // Retry with "merge" set to true
    const mergeParms = { fieldName:ConsenterFields.exhibit_forms, merge:true };
    input = consenterUpdate(TableName, newConsenter, oldConsenter).buildUpdateItemCommandInput(mergeParms) as UpdateItemCommandInput;
    expectedOutput!.ExpressionAttributeValues![":exhibit_forms"] = { L: [ efApi4, efApi5, efApi6, efApi7 ] };
    // Test for equality between command input and expected command input
    expect(deepEquivalent(input, expectedOutput)).toBe(true);

  });
});