import { mockClient } from 'aws-sdk-client-mock'
import 'aws-sdk-client-mock-jest';
import { 
  CognitoIdentityProviderClient, ListUserPoolClientsCommand, ResourceNotFoundException
} from '@aws-sdk/client-cognito-identity-provider';
import { lookupRole } from './Lookup';
import { Roles } from '../dao/entity';


const clientId = '6s4a2ilv9e5solo78f4d75hlp8';
const userPoolId = 'us-east-2_Pty3GzLm8'
const cognitoIdpClientMock = mockClient(CognitoIdentityProviderClient);

describe('Cognito Lookup: lookupRole', () => {

  const region = 'us-east-2';
  
  it('Should return undefined if there is no such userpool', async () => {
    cognitoIdpClientMock.on(ListUserPoolClientsCommand).rejects(new ResourceNotFoundException({
      $metadata: {}, message: 'Userpool not found'
    }));
    const role = await lookupRole(userPoolId, clientId, region);
    expect(role).toBeUndefined();
  });

  it('Should return undefined if there are no userpool clients', async () => {
    cognitoIdpClientMock.on(ListUserPoolClientsCommand).resolves({
      UserPoolClients: []
    });
    const role = await lookupRole(userPoolId, clientId, region);
    expect(role).toBeUndefined();
  });

  it('Should return undefined if there is no matching userpool client', async () => {
    cognitoIdpClientMock.on(ListUserPoolClientsCommand).resolves({
      UserPoolClients: [
        { UserPoolId: userPoolId, ClientId: 'bogus-id1', ClientName: 'bogus-name1' },
        { UserPoolId: userPoolId, ClientId: 'bogusId2', ClientName: 'bogusName2' },
        { UserPoolId: userPoolId, ClientId: 'bogus_id3', ClientName: 'bogus_name3' },
      ]
    });
    const role = await lookupRole(userPoolId, clientId, region);
    expect(role).toBeUndefined();
  });

  it('Should return undefined if the clientId is matched, but no valid role is recognized in the client name', async () => {
    cognitoIdpClientMock.on(ListUserPoolClientsCommand).resolves({
      UserPoolClients: [
        { UserPoolId: userPoolId, ClientId: 'bogus-id1', ClientName: 'bogus-name1' },
        { UserPoolId: userPoolId, ClientId: clientId, ClientName: 'bogusName2' },
        { UserPoolId: userPoolId, ClientId: clientId, ClientName: 'bogus_role-name3' },
        { UserPoolId: userPoolId, ClientId: 'bogus_id3', ClientName: 'bogus_name4' },
      ]
    });
    const role = await lookupRole(userPoolId, clientId, region);
    expect(role).toBeUndefined();
  });

  it('Should return the expected role if the clientId is matched and the clientName contains the matching role value', async () => {
    cognitoIdpClientMock.on(ListUserPoolClientsCommand).resolves({
      UserPoolClients: [
        { UserPoolId: userPoolId, ClientId: 'bogus-id1', ClientName: 'bogus-name1' },
        { UserPoolId: userPoolId, ClientId: clientId, ClientName: `${Roles.RE_ADMIN}-name2` },
        { UserPoolId: userPoolId, ClientId: 'bogus_id3', ClientName: 'bogus_name3' },
      ]
    });
    const role = await lookupRole(userPoolId, clientId, region);
    expect(role).toEqual(Roles.RE_ADMIN);
  })
});

