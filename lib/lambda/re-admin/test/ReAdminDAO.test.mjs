import { mockClient } from 'aws-sdk-client-mock'
import { DAO } from '../ReAdminUser.mjs'
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'

const dbMockClient = mockClient(DynamoDBClient);
const expectedResponse = {
  ConsumedCapacity: {
    CapacityUnits: 1,
    TableName: process.env.DYNAMODB_USER_TABLE_NAME
  }
};
dbMockClient.on(PutItemCommand).resolves(expectedResponse);

const dao = DAO({
  email: 'somebody@gmail.com',
  re: 'Boston University',
  role: 're-admin',
  fullname: 'Mickey Mouse'
});

describe('re-admin-user-dao', () => {
  it('Should return a response', async() => {
    const retval = await dao.create();
    expect(retval).toEqual(expectedResponse);
  });
})