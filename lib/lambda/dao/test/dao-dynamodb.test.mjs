import { mockClient } from 'aws-sdk-client-mock'
import { DAOFactory } from '../dao';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'

/** TODO: Need a fix - for some reason, using aws-sdk-client-mock use is not working in a *.ts file. */
const dbMockClient = mockClient(DynamoDBClient);

const testPut = async () => {

  const expectedResponse = {
    ConsumedCapacity: {
      CapacityUnits: 1,
      TableName: process.env.DYNAMODB_USER_TABLE_NAME
    }
  };
  dbMockClient.on(PutItemCommand).resolves(expectedResponse);

  const dao = DAOFactory.getInstance({
    email: 'somebody@gmail.com',
    entity_name: 'Boston University',
    role: 're-admin',
    fullname: 'Mickey Mouse'
  });

  describe('re-admin-user-dao', () => {
    it('Should return a response', async() => {
      const retval = await dao.create();
      expect(retval).toEqual(expectedResponse);
    });
  });
}

const testRead = async () => {
  console.log('Reading...');
}

const testQuery = async () => {
  console.log('Querying...');
}

testPut()
  .then(testRead())
  .then(testQuery())

