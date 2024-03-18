import { AdminDeleteUserCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DAOEntity, DAOInvitation, DAOUser, FactoryParms } from '../../_lib/dao/dao';
import { Entity, Invitation, Roles, User, YN } from '../../_lib/dao/entity';
import { EntityToDemolish } from './Demolition';
import * as expectedCommandInput from './DemolitionCommandInputMock.json';

const dbMockClient = mockClient(DynamoDBClient);
const cognitoMockClient = mockClient(CognitoIdentityProviderClient);

const entity_id = 'mock_entity_id';
const dte = new Date().toISOString();
const create_timestamp = dte; 
const update_timestamp = dte;
const tables = {
  user: 'ett-users',
  invitation: 'ett-invitation',
  entity: 'ett-entities'
}    
process.env.DYNAMODB_USER_TABLE_NAME = tables.user;
process.env.DYNAMODB_INVITATION_TABLE_NAME = tables.invitation;
process.env.DYNAMODB_ENTITY_TABLE_NAME = tables.entity;

const bugsbunny = {
  email: 'bugsbunny@warnerbros.com',
  entity_id,
  role: Roles.RE_ADMIN,
  sub: 'bugsbunny_cognito_sub',
  active: YN.Yes,
  create_timestamp,
  update_timestamp,
  fullname: 'Bug Bunny',
  phone_number: '+6172224444',
  title: 'Rabbit'
} as User;

const daffyduck = {
  email: 'daffyduck@warnerbros.com',
  entity_id,
  role: Roles.RE_AUTH_IND,
  active: YN.Yes,
  create_timestamp,
  update_timestamp,
  fullname: 'Daffy Duck',
  sub: 'daffyduck_cognito_sub',
  phone_number: '+7813335555',
  title: 'Duck'
} as User;

const yosemitesam = {
  email: 'yosemitesam@warnerbros.com',
  entity_id,
  role: Roles.RE_AUTH_IND,
  active: YN.Yes,
  create_timestamp,
  update_timestamp,
  fullname: 'Yosemite Sam',
  sub: 'yosemitesam_cognito_sub',
  phone_number: '+7814446666',
  title: 'Cowboy'
} as User;

const bugbunny_invitation = {
  code: 'abc123',
  entity_id,
  message_id: '0cea3257-38fd-4c24-a12f-fd731f19cae6',
  role: Roles.RE_ADMIN,
  sent_timestamp: dte,
  email: 'bugsbunny@warnerbros.com',                      
} as Invitation;

const daffyduck_invitation = {
  code: 'def456',
  entity_id,
  message_id: '0cea3257-38fd-4c24-a12f-fd731f19cae7',
  role: Roles.RE_AUTH_IND,
  sent_timestamp: dte,
  email: 'daffyduck@warnerbros.com',
} as Invitation;

const yosemitesam_invitation = {
  code: 'ghi789',
  entity_id,
  message_id: '0cea3257-38fd-4c24-a12f-fd731f19cae8',
  role: Roles.RE_AUTH_IND,
  sent_timestamp: dte,
  email: 'yosemitesam@warnerbros.com',
} as Invitation;

const entity = {
  entity_id, 
  entity_name: 'Boston University', 
  description: 'Where I work', 
  active: YN.Yes, 
  create_timestamp, 
  update_timestamp
} as Entity;

const mockUserRead = jest.fn(async ():Promise<User[]> => {
  return new Promise((resolve, reject) => {
    resolve([ bugsbunny, daffyduck, yosemitesam ] as User[]);
  });
}) as any;

const mockInvitationRead = jest.fn(async ():Promise<Invitation[]> => {
  return new Promise((resolve, reject) => {
    resolve([ bugbunny_invitation, daffyduck_invitation, yosemitesam_invitation ] as Invitation[]);
  });
}) as any;

const mockEntityRead = jest.fn(async ():Promise<any> => {
  return new Promise((resolve, reject) => {
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

    // Configure the execution of the transaction to be mocked and do nothing.
    dbMockClient.on(TransactWriteItemsCommand).resolves({ });

    // Execute the method under test.
    const entityToDemolish = new EntityToDemolish(entity_id);
    await entityToDemolish.deleteEntityFromDatabase();

    // A query should have been performed against the user and invitation dynamodb tables.
    expect(mockUserRead).toHaveBeenCalledTimes(1);
    expect(mockInvitationRead).toHaveBeenCalledTimes(1);
    // The entity table should NOT have been read from since we already have the entity_id primary key.
    expect(mockEntityRead).toHaveBeenCalledTimes(0);

    // Assert that the transaction was executed once and that it used the expected command.
    const { commandInput } = entityToDemolish;
    expect(dbMockClient).toHaveReceivedCommandTimes(TransactWriteItemsCommand, 1);
    expect(commandInput).toMatchObject(expectedCommandInput);

    // Assert that a list of the cognito usernames was collected for each user deleted.
    expect(entityToDemolish.cognitoUsernamesToDelete).toEqual([
      'bugsbunny_cognito_sub', 
      'daffyduck_cognito_sub', 
      'yosemitesam_cognito_sub'
    ]);
  });
});

describe('Demolish an entity from the userpool', () => {
  it('Should do nothing if not preceded by dynamodb user deletions', async () => {
    cognitoMockClient.on(AdminDeleteUserCommand).resolves({});

    const entityToDemolish = new EntityToDemolish(entity_id);
    await entityToDemolish.deleteEntityFromUserPool();

    expect(cognitoMockClient).toHaveReceivedCommandTimes(AdminDeleteUserCommand, 0);
  });

  it('Should remove as many users from the userpool as have been deleted from dynamodb', async () => {
    const UserPoolId = 'user_pool_ID';
    process.env.USERPOOL_ID = UserPoolId;

    cognitoMockClient.on(AdminDeleteUserCommand).resolves({});

    const entityToDemolish = new EntityToDemolish(entity_id);
    entityToDemolish.cognitoUsernamesToDelete.push('cognito_username1', 'cognito_username2', 'cognito_username3');
    await entityToDemolish.deleteEntityFromUserPool();

    expect(cognitoMockClient).toHaveReceivedCommandTimes(AdminDeleteUserCommand, 3);
    expect(cognitoMockClient).toHaveReceivedCommandWith(AdminDeleteUserCommand, {
      UserPoolId, Username: 'cognito_username1'
    });
    expect(cognitoMockClient).toHaveReceivedCommandWith(AdminDeleteUserCommand, {
      UserPoolId, Username: 'cognito_username2'
    });
    expect(cognitoMockClient).toHaveReceivedCommandWith(AdminDeleteUserCommand, {
      UserPoolId, Username: 'cognito_username3'
    });

    cognitoMockClient.resetHistory();
  });
});

describe('Demolish an entity from everywhere', () => {
  it('Should not attempt any demolition against the userpool if any of the database demolition fails', async () => {
    const UserPoolId = 'user_pool_ID';
    process.env.USERPOOL_ID = UserPoolId;

    const entityToDemolish = new EntityToDemolish(entity_id);
    await entityToDemolish.demolish();

    // Assert the database deletions.
    expect(entityToDemolish.cognitoUsernamesToDelete).toEqual([
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