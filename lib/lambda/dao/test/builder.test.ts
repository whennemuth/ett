import { UpdateItemCommandInput } from '@aws-sdk/client-dynamodb';
import { Builder, getBuilderInstance } from '../builder';
import { User, UserFields, YN } from '../entity';

const testBuildUpdate = () => {

  const TableName = "ett-user";
  const input:User = {
    email: 'somebody@gmail.com',
    entity_name: 'Boston University',
    fullname: 'Daffy Duck'
  }

  const getExpectedOutput = () => {
    // Object properties can only be deleted if they are optional.
    type OptionalValuesType = { ":v1"?: any, ":v2"?: any };
    return {
      TableName,
      ExpressionAttributeNames: {
        "#f1": UserFields.fullname,
        "#f2": UserFields.update_timestamp
      },
      ExpressionAttributeValues: {
        ":v1": { S: input.fullname },
      } as OptionalValuesType,
      Key: { 
        [ UserFields.email ]: { S: input.email, },
        [ UserFields.entity_name ]: { S: input.entity_name }
      },
      UpdateExpression: "SET #f1 = :v1, #f2 = :v2",
    };
  }

  const expectedOutput = getExpectedOutput();
  delete getExpectedOutput().ExpressionAttributeValues[':v2'];
  const builder:Builder = getBuilderInstance(input, TableName);
 
  describe('buildUpdateItem', () => {
    const before = Date.now();
    let isoTimestamp:number = 0;

    it('Should return an object whose properties match predicted values, excluding update_timestamp.', () => {
      const output:UpdateItemCommandInput = builder.buildUpdateItem();
      expect(output).toMatchObject(expectedOutput); // Note: not using toEqual because excluding update_timestamp
      isoTimestamp = Date.parse((output.ExpressionAttributeValues || {})[':v2'].S || '');
    });

    it('Should return and update_timestamp for a time after the test began.', () => {
      expect(isoTimestamp).toBeGreaterThanOrEqual(before);
    });

    it('Should return and update_timestamp for a time before now.', () => {
      const after = Date.now();
      expect(isoTimestamp).toBeLessThanOrEqual(after);
    });
  });
  
}

testBuildUpdate();