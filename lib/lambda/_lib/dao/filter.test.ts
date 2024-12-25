import { QueryCommandInput } from "@aws-sdk/client-dynamodb";
import { FilterExpression } from "./filter";

describe('FilterExpression', () => {

  it('Should apply a single equals expression correctly', () => {
    const params = {
      TableName: 'MyTable',
      IndexName: 'MyIndex',
    } as QueryCommandInput;

    const expectedParams = Object.assign({}, params);
    expectedParams.ExpressionAttributeNames = { '#fldname1': 'fldname' };
    expectedParams.ExpressionAttributeValues = { ':fldname1': { 'S': 'fldvalue' } };
    expectedParams.FilterExpression = `#fldname1 = :fldname1`;

    new FilterExpression('fldname', 'fldvalue').equalsMutator()(params);

    expect(params).toEqual(expectedParams);
  });

  it('Should append multiple equals expression correctly', () => {
    const params = {
      TableName: 'MyTable',
      IndexName: 'MyIndex',
    } as QueryCommandInput;

    const expectedParams = Object.assign({}, params);
    expectedParams.ExpressionAttributeNames = { 
      '#fldname1': 'fldname', 
      '#fld2name1': 'fld2name' 
    };
    expectedParams.ExpressionAttributeValues = { 
      ':fldname1': { S: 'fldvalue' }, 
      ':fld2name1': { S: 'fld2value' } 
    };
    expectedParams.FilterExpression = `#fldname1 = :fldname1 AND #fld2name1 = :fld2name1`;

    // Setup with existing filter expression
    new FilterExpression('fldname', 'fldvalue').equalsMutator()(params);

    // Now append more
    new FilterExpression('fld2name', 'fld2value').equalsMutator()(params);

    expect(params).toEqual(expectedParams);
  });

  it('Should apply NOT equals expressions correctly', () => {
    const params = {
      TableName: 'MyTable',
      IndexName: 'MyIndex',
    } as QueryCommandInput;

    const expectedParams = Object.assign({}, params);
    expectedParams.ExpressionAttributeNames = { 
      '#fldname1': 'fldname', 
      '#fld2name1': 'fld2name' 
    };
    expectedParams.ExpressionAttributeValues = { 
      ':fldname1': { S: 'fldvalue' }, 
      ':fld2name1': { S: 'fld2value' } 
    };
    expectedParams.FilterExpression = `#fldname1 <> :fldname1 AND #fld2name1 <> :fld2name1`;

    // Setup with existing filter expression
    new FilterExpression('fldname', 'fldvalue').notEqualsMutator()(params);

    // Now append more
    new FilterExpression('fld2name', 'fld2value').notEqualsMutator()(params);

    expect(params).toEqual(expectedParams);
  });

  it('Should apply a mix of expressions correctly', () => {
    const params = {
      TableName: 'MyTable',
      IndexName: 'MyIndex',
    } as QueryCommandInput;

    const expectedParams = Object.assign({}, params);
    expectedParams.ExpressionAttributeNames = { 
      '#fldname1': 'fldname', 
      '#fld2name1': 'fld2name' 
    };
    expectedParams.ExpressionAttributeValues = { 
      ':fldname1': { S: 'fldvalue' }, 
      ':fld2name1': { S: 'fld2value' } 
    };
    expectedParams.FilterExpression = `#fldname1 = :fldname1 AND #fld2name1 <> :fld2name1`;

    // Setup with existing filter expression
    new FilterExpression('fldname', 'fldvalue').equalsMutator()(params);

    // Now append more
    new FilterExpression('fld2name', 'fld2value').notEqualsMutator()(params);

    expect(params).toEqual(expectedParams);
  });

});