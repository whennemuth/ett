import { mockClient } from 'aws-sdk-client-mock'
import 'aws-sdk-client-mock-jest';
import { DAOFactory } from './dao';
import { DeleteItemCommand, DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { User, Roles, UserFields, YN } from './entity';

const action = process.env.ACTION_TO_TEST?.toLocaleLowerCase() || '';

const ignoreMe = (atn: string) => {
  return action.length > 0 && action != atn;
}

const dbMockClient = mockClient(DynamoDBClient);

const dte = new Date().toISOString();
const singleReturnedUser = {
  [UserFields.email]: { S: 'somebody@gmail.com' },
  [UserFields.entity_name]: { S: 'Boston University' },
  [UserFields.role]: { S: Roles.RE_ADMIN },
  [UserFields.sub]: { S: 'mm_sub_id' },
  [UserFields.fullname]: { S: 'Mickey Mouse' },
  [UserFields.active]: { S: YN.Yes },
  [UserFields.create_timestamp]: { S: dte },
  [UserFields.update_timestamp]: { S: dte },
};

const testPut = () => {  
  describe('Dao user create', () => {    

    it('Should error if invalid role specified', () => {
      expect(() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'user', Payload: {
            [UserFields.email]: 'somebody@gmail.com',
            [UserFields.entity_name]: 'Boston University',
            [UserFields.role]: 'bogus',
            [UserFields.sub]: 'somebody_sub_id',
        }});
      }).toThrow();      
    });

    it('Should error if invalid Y/N value specified', () => {
      expect(() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'user', Payload: {
            [UserFields.email]: 'somebody@gmail.com',
            [UserFields.entity_name]: 'Boston University',
            [UserFields.sub]: 'somebody_sub_id',
            active: 'bogus'            
        }});
      }).toThrow();      
    });

    it('Should NOT error if role or active is spelled correctly, but has case that does not match enum', () => {
      expect(() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'user', Payload: {
            [UserFields.email]: 'somebody@gmail.com',
            [UserFields.entity_name]: 'Boston University',
            [UserFields.role]: Roles.RE_ADMIN.toLowerCase(),
            [UserFields.sub]: 'somebody_sub_id',
            [UserFields.active]: YN.Yes.toLocaleLowerCase()
        }});
      }).not.toThrow();
    });

    it('Should error attempting to create a user without a role specified', async() => {
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: 'somebody@gmail.com',
          [UserFields.entity_name]: 'Boston University',
          [UserFields.sub]: 'mm_sub_id',
          [UserFields.fullname]: 'Mickey Mouse'
      }});
      expect(async () => {
        await dao.create();
      }).rejects.toThrow(/^User create error: Missing role in/);
    });

    it('Should error attempting to create a user without a fullname specified', async() => {
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: 'somebody@gmail.com',
          [UserFields.entity_name]: 'Boston University',
          [UserFields.sub]: 'somebody_sub_id',
          [UserFields.role]: Roles.RE_ADMIN.toLowerCase(),
      }});
      expect(async () => {
        await dao.create();
      }).rejects.toThrow(/^User create error: Missing fullname in/);
    });

    it('Should error attempting to create a user without a sub specified', async() => {
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: 'somebody@gmail.com',
          [UserFields.entity_name]: 'Boston University',
          [UserFields.fullname]: 'Mickey Mouse',
          [UserFields.role]: Roles.RE_ADMIN.toLowerCase(),
      }});
      expect(async () => {
        await dao.create();
      }).rejects.toThrow(/^User create error: Missing sub in/);
    });

    it('Should return a response', async() => {
      const expectedResponse = {
        ConsumedCapacity: {
          CapacityUnits: 1,
          TableName: process.env.DYNAMODB_USER_TABLE_NAME
        }
      };
      dbMockClient.on(PutItemCommand).resolves(expectedResponse);
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: 'somebody@gmail.com',
          [UserFields.entity_name]: 'Boston University',
          [UserFields.role]: Roles.RE_ADMIN,
          [UserFields.sub]: 'somebody_sub_id',
          [UserFields.fullname]: 'Mickey Mouse' 
      }});
      const retval = await dao.create();
      expect(retval).toEqual(expectedResponse);
    });
  });
}

const testRead = () => {
  describe('Dao user read', () => {

    it('Should error if both email and entity name are missing', async() => {
      expect(async () => {
        const dao = DAOFactory.getInstance({
          DAOType: 'user', Payload: {
            [UserFields.fullname]: 'Mickey Mouse'
        }});
      }).rejects.toThrow(/^User crud error: Missing email in/);
    });

    it('Should return an object of type User if both email and entity name were provided', async() => {
      dbMockClient.on(GetItemCommand).resolves({
        ConsumedCapacity: {},
        Item: singleReturnedUser
      });
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: 'somebody@gmail.com',
          [UserFields.entity_name]: 'Boston University',
      }});
      const output = await dao.read();
      expect(dbMockClient).toHaveReceivedCommandTimes(GetItemCommand, 1);
      expect(output).toHaveProperty(UserFields.email);
      const user:User = output as User;
      expect(user[UserFields.email]).toEqual('somebody@gmail.com');
    });

    it('Should return an array of type user if only email was provided', async() => {
      dbMockClient.on(QueryCommand).resolves({
        ConsumedCapacity: {},
        Count: 1, ScannedCount: 1,
        Items: [ singleReturnedUser ]
      });
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: 'somebody@gmail.com',
      }});
      const output = await dao.read();
      expect(dbMockClient).toHaveReceivedCommandTimes(QueryCommand, 1);
      expect(output).toBeInstanceOf(Array);
      const users:User[] = output as User[];
      expect(users[0]).toHaveProperty(UserFields.email);
      expect(users[0][UserFields.email]).toEqual('somebody@gmail.com');
    });
  });
}

const testUpdate = () => {
  describe('Dao user update', () => {

    it('Should error if either email or entity name are missing (no bulk updates)', async() => {
      expect(async() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'user', Payload: {
            [UserFields.email]: 'somebody@gmail.com',
        }});
        await dao.update();
      }).rejects.toThrow(/^User update error: Missing entity_name in/);

      expect(async() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'user', Payload: {
            [UserFields.entity_name]: 'Boston University',
        }});
        await dao.update();
      }).rejects.toThrow(/^User crud error: Missing email in/);
    });

    it('Should error if email and entity name are the only fields provided', async() => {
      expect(async() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'user', Payload: {
            [UserFields.email]: 'somebody@gmail.com',
            [UserFields.entity_name]: 'Boston University',
        }});
        await dao.update();
      }).rejects.toThrow(/^User update error: No fields to update for/);
    });

    it('Should NOT error if a field to update has been supplied', async() => {
      dbMockClient.on(UpdateItemCommand).resolves({
        Attributes: singleReturnedUser
      });
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: 'somebody@gmail.com',
          [UserFields.entity_name]: 'Boston University',
          [UserFields.fullname]: 'Daffy Duck',
      }});
      await dao.update();
      expect(dbMockClient).toHaveReceivedCommandTimes(UpdateItemCommand, 1);
    })
  });
}

const testDelete = () => {
  describe('Dao user delete', () => {

    it('Should error if either email or entity name are missing (no bulk deletes)', async() => {
      expect(async() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'user', Payload: {
            [UserFields.email]: 'somebody@gmail.com',
        }});
        await dao.Delete();
      }).rejects.toThrow(/^User delete error: Missing entity_name in/);

      expect(async() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'user', Payload: {
            [UserFields.entity_name]: 'Boston University',
        }});
        await dao.update();
      }).rejects.toThrow(/^User crud error: Missing email in/);
    });

    it('Should accept just partition and sort keys', async() => {
      dbMockClient.resetHistory();
      dbMockClient.on(DeleteItemCommand).resolves({      
        ConsumedCapacity: {
          CapacityUnits: 1,
          TableName: process.env.DYNAMODB_USER_TABLE_NAME || 'ett-users'
        }      
      });
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: 'somebody@gmail.com',
          [UserFields.entity_name]: 'Boston University',
      }});
      await dao.Delete();
      expect(dbMockClient).toHaveReceivedCommandTimes(DeleteItemCommand, 1);
    });

    it('Should ignore extraneous fields without throwing error', async() => {
      dbMockClient.resetHistory();
      dbMockClient.on(DeleteItemCommand).resolves({      
        ConsumedCapacity: {
          CapacityUnits: 1,
          TableName: process.env.DYNAMODB_USER_TABLE_NAME || 'ett-users'
        }      
      });
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: 'somebody@gmail.com',
          [UserFields.entity_name]: 'Boston University',
          [UserFields.fullname]: 'Mickey Mouse',
          [UserFields.role]: Roles.CONSENTING_PERSON  
      }});
      await dao.Delete();
      expect(dbMockClient).toHaveReceivedCommandTimes(DeleteItemCommand, 1);
    });
  });

}

if( ! ignoreMe('create')) {
  testPut();
}

if( ! ignoreMe('read')) {
  testRead();
}

if( ! ignoreMe('update')) {
  testUpdate();
}

if( ! ignoreMe('delete')) {
  testDelete();
}


