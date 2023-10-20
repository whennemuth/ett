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
    it('Should return predicted values except update_timestamp, which should be between two points in time.', async() => {
      const output = builder.buildUpdateItem();
      expect(output).toMatchObject(expectedOutput);
    })
    // RESUME NEXT: Create a string to date function and perform 2 asserts against the returned update_timestamp field
  });
  
}

testBuildUpdate();