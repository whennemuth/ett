import { AdminDeleteUserCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';
import { DeleteObjectsCommandOutput, ObjectIdentifier } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DAOConfig, DAOConsenter, DAOEntity, DAOInvitation, DAOUser, FactoryParms } from '../../_lib/dao/dao';
import { Config, Consenter, Invitation, User } from '../../_lib/dao/entity';
import { EntityToDemolish } from './Demolition';
import { expectedCommandInput } from './DemolitionCommandInputMock';
import { bugbunny_invitation, bugsbunny, daffyduck, daffyduck_invitation, entity, yosemitesam, yosemitesam_invitation } from '../../functions/authorized-individual/MockObjects';

const dbMockClient = mockClient(DynamoDBClient);
const cognitoMockClient = mockClient(CognitoIdentityProviderClient);

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

const mockConsenterRead = jest.fn(async ():Promise<any> => {
  return new Promise((resolve) => {
    // TODO: Add functionality to demolition.ts, if needed, to remove consenting person activity related to the entity being demolished.
    resolve({ } as Consenter[]);
  });
}) as any;

const mockConfigRead = jest.fn(async ():Promise<any> => {
  return new Promise((resolve) => {
    resolve({ } as Config[])
  })
}) as any;

jest.mock('../dao/dao.ts', () => {
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
          case 'consenter':
            return { read: mockConsenterRead } as DAOConsenter;
          case 'config':
            return { read: mockConfigRead } as DAOConfig;
        }
      })
    }
  }
});

jest.mock('../../functions/consenting-person/BucketItem.ts', () => {
  return {
    BucketItem: jest.fn().mockImplementation(() => { 
      return {
        deleteMultipleItems: async (Objects:ObjectIdentifier[]):Promise<DeleteObjectsCommandOutput> => {
          return {
            $metadata: { httpStatusCode: 200 },
            Deleted: [],
            Errors: []
          } as DeleteObjectsCommandOutput
        },
        listAllKeys: async () => {
          return [];
        }
      }
    })
  }
});

const mockCleanup = jest.fn(async () => {}) as any;
jest.mock('../timer/cleanup/Cleanup.ts', () => {
  return {
    Cleanup: jest.fn().mockImplementation(() => {
      return {
        cleanup: mockCleanup,
        getDeletedSchedules: jest.fn(() => []) as any,
      }
    })
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

  it.skip('Should not attempt any demolition against the userpool if any of the database demolition fails', async () => {
    console.log('Not implemented');
  });

  it('It should delete from database, userpool, and eventbridge', async () => {
    cognitoMockClient.resetHistory();

    const UserPoolId = 'user_pool_ID';
    process.env.USERPOOL_ID = UserPoolId;
    process.env.REGION = 'us-west-2';
    process.env.PREFIX = 'ett-dev';

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

    expect(mockCleanup).toHaveBeenCalledTimes(1);

    cognitoMockClient.resetHistory();
  });
});