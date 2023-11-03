import { handler } from './PostSignup';
import { Roles, User } from '../../dao/entity';
import { DAO } from '../../dao/dao';
import { PostSignupEventType } from './PostSignupEventType';
import { mockClient } from 'aws-sdk-client-mock'
import 'aws-sdk-client-mock-jest';
import { 
  CognitoIdentityProviderClient, ListUserPoolClientsCommand, ListUserPoolClientsResponse
} from '@aws-sdk/client-cognito-identity-provider';

import { DynamoDBClient, PutItemCommand, PutItemCommandOutput } from '@aws-sdk/client-dynamodb'

// ---------------------- EVENT DETAILS ----------------------
const clientId = '6s4a2ilv9e5solo78f4d75hlp8';
const ClientId = clientId;
const userPoolId = 'us-east-2_J9AbymKIz'
const UserPoolId = userPoolId;
let crud_operation_attempts = 0;


// ---------------------- MOCKS ----------------------

  // Mock the cognito idp client
const cognitoIdpClientMock = mockClient(CognitoIdentityProviderClient);

  // Create a mock that makes each dynamodb dao crud operation callable only, 
  // each doing nothing except returning immediately.
jest.mock('../../dao/dao.ts', () => {
  const getMockPromise = () => {
    return new Promise((resolve, reject) => {
      resolve( {} as User|void);
    });
  }
  return {
    __esModule: true,
    DAOFactory: {
      getInstance: (userinfo:any):DAO => {
        return {
          create: async ():Promise<any> => { 
            return new Promise((resolve, reject) => {
              crud_operation_attempts++;
              resolve({} as User|void);
            }); 
          },
          Delete: async ():Promise<any> => { return getMockPromise(); },
          read: async ():Promise<User|User[]> => { return getMockPromise() as Promise<User>; },
          update: async ():Promise<any> => { return getMockPromise(); },
          test: async ():Promise<any> => { return getMockPromise(); },
        }
      }
    }
  }
});

// ---------------------- TESTS ----------------------
describe('Post signup lambda trigger', () => {

  it('Should skip all SDK use if the event has no userpoolId, and throw error.', async () => {
    cognitoIdpClientMock.on(ListUserPoolClientsCommand).resolves({});
    expect(async () => {
      await handler({});
    }).rejects.toThrowError();    
    expect(cognitoIdpClientMock).toHaveReceivedCommandTimes(ListUserPoolClientsCommand, 0);
    expect(crud_operation_attempts).toEqual(0);
    cognitoIdpClientMock.resetHistory();
  });

  it('Should skip all SDK use if the event has no clientId, and throw error.' , async () => {
    cognitoIdpClientMock.on(ListUserPoolClientsCommand).resolves({});
    expect(async () => {
      await handler({
        userPoolId: 'us-east-2_J9AbymKIz',
      });
    }).rejects.toThrowError();    
    expect(cognitoIdpClientMock).toHaveReceivedCommandTimes(ListUserPoolClientsCommand, 0);
    expect(crud_operation_attempts).toEqual(0);
    cognitoIdpClientMock.resetHistory();
  });

  it('Should error if the user pool clients lookup does not return a match.', () => {
    // No userpool clients at all.
    cognitoIdpClientMock.on(ListUserPoolClientsCommand).resolves({});
    expect(async () => {
      await handler({ userPoolId, callerContext: { clientId }});
    }).rejects.toThrowError();    
    expect(cognitoIdpClientMock).toHaveReceivedCommandTimes(ListUserPoolClientsCommand, 1);
    expect(crud_operation_attempts).toEqual(0);
    cognitoIdpClientMock.resetHistory();

    // No userpool clients that match.
    cognitoIdpClientMock.on(ListUserPoolClientsCommand).resolves({
      UserPoolClients: [
        { ClientId: 'mismatching_id_1', ClientName: 'some_name_1', UserPoolId },
        { ClientId: 'mismatching_id_2', ClientName: 'some_name_2', UserPoolId },
        { ClientId: 'mismatching_id_3', ClientName: 'some_name_3', UserPoolId },
      ]
    } as ListUserPoolClientsResponse);
    expect(async () => {
      await handler({ userPoolId, callerContext: { clientId }});
    }).rejects.toThrowError();    
    expect(cognitoIdpClientMock).toHaveReceivedCommandTimes(ListUserPoolClientsCommand, 1);
    expect(crud_operation_attempts).toEqual(0);
    cognitoIdpClientMock.resetHistory();
  });

  it('Should NOT attempt to make a dynamodb entry for the user if client lookup found a match, \
  but a role cannot be ascertained from its name.', () => {
    cognitoIdpClientMock.on(ListUserPoolClientsCommand).resolves({
      UserPoolClients: [
        { ClientId: 'mismatching_id_1', ClientName: 'some_name_1', UserPoolId },
        { ClientId, ClientName: 'BOGUS_ROLE-some_name_2', UserPoolId },
        { ClientId: 'mismatching_id_3', ClientName: 'some_name_3', UserPoolId },
      ]
    } as ListUserPoolClientsResponse);
    expect(async () => {
      await handler({ userPoolId, callerContext: { clientId }});
    }).rejects.toThrowError();    
    expect(cognitoIdpClientMock).toHaveReceivedCommandTimes(ListUserPoolClientsCommand, 1);
    expect(crud_operation_attempts).toEqual(0);
    cognitoIdpClientMock.resetHistory();
  });

  it('Should NOT attempt to make a dynamodb entry for the user if client lookup found a match, \
  and a role could be ascertained, but insufficient attributes available in event.', () => {
    cognitoIdpClientMock.on(ListUserPoolClientsCommand).resolves({
      UserPoolClients: [
        { ClientId: 'mismatching_id_1', ClientName: 'some_name_1', UserPoolId },
        { ClientId, ClientName: `${Roles.RE_AUTH_IND}-some_name_2`, UserPoolId },
        { ClientId: 'mismatching_id_3', ClientName: 'some_name_3', UserPoolId },
      ]
    } as ListUserPoolClientsResponse);
    
    expect(async () => {
      await handler({ 
        userPoolId, 
        callerContext: { clientId }
      });
    }).rejects.toThrowError();    
    expect(cognitoIdpClientMock).toHaveReceivedCommandTimes(ListUserPoolClientsCommand, 1);
    expect(crud_operation_attempts).toEqual(0);
    cognitoIdpClientMock.resetHistory();
    
    expect(async () => {
      await handler({ 
        userPoolId, 
        callerContext: { clientId },
        request: {
          userAttributes: {
            sub: 'asdgsgsfdgsdfg',
            name: 'Daffy Duck',
            // email will be missing
          }
        }
      });
    }).rejects.toThrowError();    
    expect(cognitoIdpClientMock).toHaveReceivedCommandTimes(ListUserPoolClientsCommand, 1);
    expect(crud_operation_attempts).toEqual(0);
    cognitoIdpClientMock.resetHistory();
  });

  it('Should attempt to make a dynamodb entry for the user if role lookup succeeds and \
  sufficient attributes came with the event', async () => {
    await handler({ 
      userPoolId, 
      callerContext: { clientId },
      request: {
        userAttributes: {
          sub: 'asdgsgsfdgsdfg',
          name: 'Daffy Duck',
          email: 'daffy@warnerbros.com',
          email_verified: 'true'
        }
      }
    });     
    expect(cognitoIdpClientMock).toHaveReceivedCommandTimes(ListUserPoolClientsCommand, 1);
    expect(crud_operation_attempts).toEqual(1);
  });

});