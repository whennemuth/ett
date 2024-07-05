import { DeleteItemCommand, DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DAOFactory, DAOUser } from './dao';
import { Roles, User, UserFields, YN } from './entity';
import { DynamoDbConstruct, TableBaseNames } from '../../../DynamoDb';

const dbMockClient = mockClient(DynamoDBClient);

const dte = new Date().toISOString();
const email = 'somebody@gmail.com';
const entity_id = 'abc123';
const sub = 'mm_sub_id';
const fullname = 'Mickey Mouse';
const dynamodbItem = {
  [UserFields.email]: { S: email },
  [UserFields.entity_id]: { S: entity_id },
  [UserFields.role]: { S: Roles.RE_ADMIN },
  [UserFields.sub]: { S: sub },
  [UserFields.fullname]: { S: fullname },
  [UserFields.active]: { S: YN.Yes },
  [UserFields.create_timestamp]: { S: dte },
  [UserFields.update_timestamp]: { S: dte },
};
const TableName = DynamoDbConstruct.getTableName(TableBaseNames.USERS);

const testPut = () => {  
  describe('Dao user create', () => {    

    it('Should error if invalid role specified', () => {
      expect(() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'user', Payload: {
            [UserFields.email]: email,
            [UserFields.entity_id]: entity_id,
            [UserFields.role]: 'bogus',
            [UserFields.sub]: 'somebody_sub_id',
        }});
      }).toThrow();      
    });

    it('Should error if invalid Y/N value specified', () => {
      expect(() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'user', Payload: {
            [UserFields.email]: email,
            [UserFields.entity_id]: entity_id,
            [UserFields.sub]: 'somebody_sub_id',
            active: 'bogus'            
        }});
      }).toThrow();      
    });

    it('Should NOT error if role or active is spelled correctly, but has case that does not match enum', () => {
      expect(() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'user', Payload: {
            [UserFields.email]: email,
            [UserFields.entity_id]: entity_id,
            [UserFields.role]: Roles.RE_ADMIN.toLowerCase(),
            [UserFields.sub]: 'somebody_sub_id',
            [UserFields.active]: YN.Yes.toLocaleLowerCase()
        }});
      }).not.toThrow();
    });

    it('Should error attempting to create a user without a role specified', async () => {
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: email,
          [UserFields.entity_id]: entity_id,
          [UserFields.sub]: sub,
          [UserFields.fullname]: fullname
      }});
      expect(async () => {
        await dao.create();
      }).rejects.toThrow(/^User create error: Missing role in/);
    });

    it('Should error attempting to create a non-SYS_ADMIN user without a fullname specified', async () => {
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: email,
          [UserFields.entity_id]: entity_id,
          [UserFields.sub]: 'somebody_sub_id',
          [UserFields.role]: Roles.RE_ADMIN,
      }});
      expect(async () => {
        await dao.create();
      }).rejects.toThrow(/^User create error: Missing fullname in/);
    });

    it('Should NOT error attempting to create SYS_ADMIN user without a fullname specified', async () => {
      const expectedResponse = {
        ConsumedCapacity: {
          CapacityUnits: 1,
          TableName
        }
      };
      dbMockClient.on(PutItemCommand).resolves(expectedResponse);
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: email,
          [UserFields.entity_id]: entity_id,
          [UserFields.sub]: 'somebody_sub_id',
          [UserFields.role]: Roles.SYS_ADMIN,
      }});
      const retval = await dao.create();
      expect(retval).toEqual(expectedResponse);
    });

    it('Should error attempting to create a user without a sub specified', async () => {
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: email,
          [UserFields.entity_id]: entity_id,
          [UserFields.fullname]: fullname,
          [UserFields.role]: Roles.RE_ADMIN.toLowerCase(),
      }});
      expect(async () => {
        await dao.create();
      }).rejects.toThrow(/^User create error: Missing sub in/);
    });

    it('Should return a response', async () => {
      const expectedResponse = {
        ConsumedCapacity: {
          CapacityUnits: 1,
          TableName
        }
      };
      dbMockClient.on(PutItemCommand).resolves(expectedResponse);
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: email,
          [UserFields.entity_id]: entity_id,
          [UserFields.role]: Roles.RE_ADMIN,
          [UserFields.sub]: 'somebody_sub_id',
          [UserFields.fullname]: fullname 
      }});
      const retval = await dao.create();
      expect(retval).toEqual(expectedResponse);
    });
  });
}

const testRead = () => {
  describe('Dao user read', () => {

    it('Should return an object of type User if both email and entity_id were provided', async () => {
      dbMockClient.on(GetItemCommand).resolves({
        ConsumedCapacity: {},
        Item: dynamodbItem
      });
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: email,
          [UserFields.entity_id]: entity_id,
      }});
      const output = await dao.read();
      expect(dbMockClient).toHaveReceivedCommandTimes(GetItemCommand, 1);
      expect(output).toHaveProperty(UserFields.email);
      const user:User = output as User;
      expect(user[UserFields.email]).toEqual(email);
    });

    it('Should return an array of type user if only email was provided', async () => {
      dbMockClient.on(QueryCommand).resolves({
        ConsumedCapacity: {},
        Count: 1, ScannedCount: 1,
        Items: [ dynamodbItem ]
      });
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: email,
      }});
      const output = await dao.read();
      expect(dbMockClient).toHaveReceivedCommandTimes(QueryCommand, 1);
      expect(output).toBeInstanceOf(Array);
      const users = output as User[];
      expect(users[0]).toHaveProperty(UserFields.email);
      expect(users[0][UserFields.email]).toEqual(email);
    });
  });
}

const testUpdate = () => {
  describe('Dao user update', () => {

    it('Should error if either email or entity_id are missing (no bulk updates)', async () => {
      expect(async () => {
        const dao = DAOFactory.getInstance({
          DAOType: 'user', Payload: {
            [UserFields.email]: email,
        }});
        await dao.update();
      }).rejects.toThrow(/^User update error: Missing entity_id in/);

      expect(async () => {
        const dao = DAOFactory.getInstance({
          DAOType: 'user', Payload: {
            [UserFields.entity_id]: entity_id,
        }});
        await dao.update();
      }).rejects.toThrow(/^User update error: Missing email in/);
    });

    it('Should error if email and entity_id are the only fields provided', async () => {
      expect(async () => {
        const dao = DAOFactory.getInstance({
          DAOType: 'user', Payload: {
            [UserFields.email]: email,
            [UserFields.entity_id]: entity_id,
        }});
        await dao.update();
      }).rejects.toThrow(/^User update error: No fields to update for/);
    });

    it('Should NOT error if a field to update has been supplied', async () => {
      dbMockClient.on(UpdateItemCommand).resolves({
        Attributes: dynamodbItem
      });
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: email,
          [UserFields.entity_id]: entity_id,
          [UserFields.fullname]: 'Daffy Duck',
      }});
      await dao.update();
      expect(dbMockClient).toHaveReceivedCommandTimes(UpdateItemCommand, 1);
    })
  });
}

const testDelete = () => {
  describe('Dao user delete', () => {

    it('Should error if either email or entity_id are missing (no bulk deletes)', async () => {
      expect(async () => {
        const dao = DAOFactory.getInstance({
          DAOType: 'user', Payload: {
            [UserFields.email]: email,
        }});
        await dao.Delete();
      }).rejects.toThrow(/^User delete error: Missing entity_id in/);

      expect(async () => {
        const dao = DAOFactory.getInstance({
          DAOType: 'user', Payload: {
            [UserFields.entity_id]: entity_id,
        }});
        await dao.Delete();
      }).rejects.toThrow(/^User delete error: Missing email in/);
    });

    it('Should accept just partition and sort keys', async () => {
      dbMockClient.resetHistory();
      dbMockClient.on(DeleteItemCommand).resolves({      
        ConsumedCapacity: {
          CapacityUnits: 1,
          TableName
        }      
      });
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: email,
          [UserFields.entity_id]: entity_id,
      }});
      await dao.Delete();
      expect(dbMockClient).toHaveReceivedCommandTimes(DeleteItemCommand, 1);
    });

    it('Should ignore extraneous fields without throwing error', async () => {
      dbMockClient.resetHistory();
      dbMockClient.on(DeleteItemCommand).resolves({      
        ConsumedCapacity: {
          CapacityUnits: 1,
          TableName
        }      
      });
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: email,
          [UserFields.entity_id]: entity_id,
          [UserFields.fullname]: fullname,
          [UserFields.role]: Roles.CONSENTING_PERSON  
      }});
      await dao.Delete();
      expect(dbMockClient).toHaveReceivedCommandTimes(DeleteItemCommand, 1);
    });
  });

}

const testDeleteEntity = () => {
  it('Should error if entity_id is missing', async () => {
    expect(() => {
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: { }}) as DAOUser;
      return dao.deleteEntity();
    }).rejects.toThrow(/^User delete-entity error: Missing entity_id in/);
  });

  const response = {      
    ConsumedCapacity: {
      CapacityUnits: 1,
      TableName
    }      
  };
  dbMockClient.on(DeleteItemCommand).resolves(response);
  it('Should NOT error if email is missing', async () => {
    const dao = DAOFactory.getInstance({
      DAOType: 'user', Payload: {
        [UserFields.entity_id]: entity_id,
    }}) as DAOUser;
    expect( dao.deleteEntity()).resolves.toEqual(response);
  });
}

testPut();

testRead();

testUpdate();

testDelete();

testDeleteEntity();

