import { AdminDeleteUserCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DAOEntity, DAOInvitation, DAOUser, FactoryParms } from '../../_lib/dao/dao';
import { Invitation, User } from '../../_lib/dao/entity';
import { EntityToDemolish } from './Demolition';
import * as expectedCommandInput from './DemolitionCommandInputMock.json';
import { tables, entity, bugsbunny, daffyduck, yosemitesam, bugbunny_invitation, daffyduck_invitation, yosemitesam_invitation } from './MockObjects';

const dbMockClient = mockClient(DynamoDBClient);
const cognitoMockClient = mockClient(CognitoIdentityProviderClient);

process.env.DYNAMODB_USER_TABLE_NAME = tables.user;
process.env.DYNAMODB_INVITATION_TABLE_NAME = tables.invitation;
process.env.DYNAMODB_ENTITY_TABLE_NAME = tables.entity;

const mockUserRead = jest.fn(async ():Promise<User[]> => {
  return new Promise((resolve) => {
    resolve([ bugsbunny, daffyduck, yosemitesam ] as User[]);
  });
}) as any;

const mockInvitationRead = jest.fn(async ():Promise<Invitation[]> => {
  return new Promise((resolve) => {
    resolve([ bugbunny_invitation, daffyduck_invitation, yosemitesam_invitation ] as Invitation[]);
  });
}) as any;

const mockEntityRead = jest.fn(async ():Promise<any> => {
  return new Promise((resolve) => {
    resolve(entity);
  });
}) as any;

jest.mock('../../_lib/dao/dao.ts', () => {
  return {
    __esModule: true,
    DAOFactory: {
      getInstance: jest.fn().mockImplementation((parms:FactoryParms) => {
        switch(parms.DAOType) {
          case 'user': 
            return { read: mockUserRead } as DAOUser;
          case 'invitation':
            return { read: mockInvitationRead } as DAOInvitation;
          case 'entity':
            return { read: mockEntityRead } as DAOEntity;
        }
      })
    }
  }
});

describe('Demolish an entity from the database', () => {

  it('Should stock the transaction items array of the command input with the expected commands', async () => {
    cognitoMockClient.resetHistory();
    
    // Configure the execution of the transaction to be mocked and do nothing.
    dbMockClient.on(TransactWriteItemsCommand).resolves({ });

    // Execute the method under test.
    const entityToDemolish = new EntityToDemolish(entity.entity_id);
    await entityToDemolish.deleteEntityFromDatabase();

    // A query should have been performed against the user, invitation, and entity dynamodb tables.
    expect(mockUserRead).toHaveBeenCalledTimes(1);
    expect(mockInvitationRead).toHaveBeenCalledTimes(1);
    expect(mockEntityRead).toHaveBeenCalledTimes(1);

    // Assert that the transaction was executed once and that it used the expected command.
    const { commandInput } = entityToDemolish;
    expect(dbMockClient).toHaveReceivedCommandTimes(TransactWriteItemsCommand, 1);
    expect(commandInput).toMatchObject(expectedCommandInput);

    // Assert that a list of the cognito usernames was collected for each user deleted.
    expect((entityToDemolish.deletedUsers.map((user:User) => user.sub) as string[])).toEqual([
      'bugsbunny_cognito_sub', 
      'daffyduck_cognito_sub', 
      'yosemitesam_cognito_sub'
    ]);
    
    expect(entityToDemolish.entity).toEqual(entity);
    cognitoMockClient.resetHistory();
  });
});

describe('Demolish an entity from the userpool', () => {
  it('Should do nothing if not preceded by dynamodb user deletions', async () => {
    cognitoMockClient.resetHistory();
    
    cognitoMockClient.on(AdminDeleteUserCommand).resolves({});

    const entityToDemolish = new EntityToDemolish(entity.entity_id);
    await entityToDemolish.deleteEntityFromUserPool();

    expect(cognitoMockClient).toHaveReceivedCommandTimes(AdminDeleteUserCommand, 0);
  });

  it('Should remove as many users from the userpool as have been deleted from dynamodb', async () => {
    cognitoMockClient.resetHistory();
    
    const UserPoolId = 'user_pool_ID';
    process.env.USERPOOL_ID = UserPoolId;

    cognitoMockClient.on(AdminDeleteUserCommand).resolves({});

    const entityToDemolish = new EntityToDemolish(entity.entity_id);
    entityToDemolish.deletedUsers.push(bugsbunny, daffyduck, yosemitesam);
    await entityToDemolish.deleteEntityFromUserPool();

    expect(cognitoMockClient).toHaveReceivedCommandTimes(AdminDeleteUserCommand, 3);
    expect(cognitoMockClient).toHaveReceivedCommandWith(AdminDeleteUserCommand, {
      UserPoolId, Username: 'bugsbunny_cognito_sub'
    });
    expect(cognitoMockClient).toHaveReceivedCommandWith(AdminDeleteUserCommand, {
      UserPoolId, Username: 'daffyduck_cognito_sub'
    });
    expect(cognitoMockClient).toHaveReceivedCommandWith(AdminDeleteUserCommand, {
      UserPoolId, Username: 'yosemitesam_cognito_sub'
    });
  });
});

describe('Demolish an entity from everywhere', () => {
  it('Should not attempt any demolition against the userpool if any of the database demolition fails', async () => {
    cognitoMockClient.resetHistory();

    const UserPoolId = 'user_pool_ID';
    process.env.USERPOOL_ID = UserPoolId;

    const entityToDemolish = new EntityToDemolish(entity.entity_id);
    await entityToDemolish.demolish();

    // Assert the database deletions.
    expect((entityToDemolish.deletedUsers.map((user:User) => user.sub) as string[])).toEqual([
      'bugsbunny_cognito_sub', 
      'daffyduck_cognito_sub', 
      'yosemitesam_cognito_sub'
    ]);

    // Assert the userpool deletions.
    expect(cognitoMockClient).toHaveReceivedCommandTimes(AdminDeleteUserCommand, 3);
    expect(cognitoMockClient).toHaveReceivedCommandWith(AdminDeleteUserCommand, {
      UserPoolId, Username: 'bugsbunny_cognito_sub'
    });
    expect(cognitoMockClient).toHaveReceivedCommandWith(AdminDeleteUserCommand, {
      UserPoolId, Username: 'daffyduck_cognito_sub'
    });
    expect(cognitoMockClient).toHaveReceivedCommandWith(AdminDeleteUserCommand, {
      UserPoolId, Username: 'yosemitesam_cognito_sub'
    });

    cognitoMockClient.resetHistory();
  });
});