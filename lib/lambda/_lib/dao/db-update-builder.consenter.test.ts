import { UpdateItemCommandInput } from '@aws-sdk/client-dynamodb';
import { DynamoDbConstruct } from '../../../DynamoDb';
import { consenterUpdate } from './db-update-builder.consenter';
import { Affiliate, Consenter, ConsenterFields } from './entity';

describe('getCommandInputBuilderForConsenterUpdate', () => {

  const { email, fullname, phone_number, sub, title, exhibit_forms, update_timestamp } = ConsenterFields;

  const isoString = new Date().toISOString();
  Date.prototype.toISOString = () => { return isoString; };
  const TableName = DynamoDbConstruct.DYNAMODB_CONSENTER_TABLE_NAME;
  const daffyEmail = 'daffyduck@warnerbros.com';

  const oldConsenter = {
    email: daffyEmail,
    fullname: 'Daffy Duck',
    title: 'Aquatic Fowl',
    phone_number: '781-444-6666',
    create_timestamp: isoString,
  } as Consenter;

  const newConsenter = {
    email: daffyEmail,
    fullname: 'Daffy the Duck',
    title: 'Director of Animation',
    phone_number: oldConsenter.phone_number,
    sub: 'abc123'
  } as Consenter;

  const bugs = {

  } as Affiliate;

  it('Should produce the expected command for non-exhibit update', () => {
    const command = consenterUpdate(TableName, newConsenter, oldConsenter).buildUpdateItem() as UpdateItemCommandInput;

    console.log(JSON.stringify(command, null, 2));

    const expectedOutput = {
      TableName,
      Key: { [email]: { S: daffyEmail }},
      ExpressionAttributeNames: {        
        ["#sub"]: sub,
        ["#fullname"]: fullname,
        ["#title"]: title,
        ["#update_timestamp"]: update_timestamp,
      },
      ExpressionAttributeValues: {
        [":sub"]: { "S": newConsenter.sub },
        [":fullname"]: { "S": newConsenter.fullname },
        [":title"]: { "S": newConsenter.title },
        [":update_timestamp"]: { "S": isoString },
      },
      // NOTE: fields will be set in the same order as they appear in the entity.ConsenterFields
      UpdateExpression: `SET #sub = :sub, #fullname = :fullname, #title = :title, #phone_number = :phone_number, #update_timestamp = :update_timestamp`
    } as UpdateItemCommandInput;

    expect(command).toEqual(expectedOutput);
  });

  it('Should produce the expected command for exhibit append', () => {
    // Get a consenter with an update that includes a new exhibit form, but no affiliates yet. 
    const _new = Object.assign({
      exhibit_forms: [ { entity_id: 'abc123' } ]
    } as Consenter, oldConsenter);
    // Run the builder and assert that only a SET of exhibit_form is reflected in the result.
    const command = consenterUpdate(TableName, _new, oldConsenter).buildUpdateItem() as UpdateItemCommandInput;

    console.log(JSON.stringify(command, null, 2));

    const expectedOutput = {
      TableName,
      Key: { [email]: { S: daffyEmail }},
      ExpressionAttributeNames: {        
        ["#exhibit_forms1"]: exhibit_forms,
        ["#update_timestamp1"]: update_timestamp,
      },
      ExpressionAttributeValues: {
        [":exhibit_forms1"]: { "M": { entity_id: { "S": "abc123" } } },
        [":update_timestamp1"]: { "S": isoString },
      },
      // NOTE: fields will be set in the same order as they appear in the entity.ConsenterFields
      UpdateExpression: `SET #exhibit_forms1 = :exhibit_forms1, #update_timestamp = :update_timestamp`
    } as UpdateItemCommandInput;

    // RESUME NEXT: This test is unfinished - method under test is not finished.
    expect(command).toEqual(expectedOutput);
  });

  // it('Should produce the expected command for exhibit update', () => {

  // });

  // it('Should produce the expected command for exhibit removal', () => {

  // });

  // it('Should produce the expected command for all scenarios combined', () => {

  // });
});