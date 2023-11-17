import 'aws-sdk-client-mock-jest';
import { mockClient } from 'aws-sdk-client-mock'
import { CognitoIdentityProviderClient, ListUserPoolsCommand, ListUserPoolClientsCommand, 
  ListUserPoolsCommandOutput, ListUserPoolClientsCommandOutput } from "@aws-sdk/client-cognito-identity-provider";
import { SignupLink } from './SignupLink';

// Mock the cognito idp client
const cognitoIdpClientMock = mockClient(CognitoIdentityProviderClient);

// Mock the listing of userpools
cognitoIdpClientMock.on(ListUserPoolsCommand).resolves({
  UserPools: [{ 
    Id: "us-east-2_J9AbymKIz",
    Name: "EttCognito-userpool",
    Status: "Enabled",
  }]
} as ListUserPoolsCommandOutput);

// Mock the listing of userpool clients for the userpool
cognitoIdpClientMock.on(ListUserPoolClientsCommand).resolves({
  UserPoolClients: [
    {
      ClientId: "6lgr9r32asit6hn3ugo9f71hp",
      UserPoolId: "us-east-2_J9AbymKIz",
      ClientName: "EttCognitoUserPoolREADMINuserpoolclientA2D8DFC6-DXXaHN15Ov0H",
    },
    {
      ClientId: "6rmo8njptnv0a2nd9skuq9hr04",
      UserPoolId: "us-east-2_J9AbymKIz",
      ClientName: "EttCognitoUserPoolHELLOWORLDuserpoolclientD9D460DF-N3joKabRohaF",
    },
    {
      ClientId: "bogus",
      UserPoolId: "us-east-2_J9AbymKIz",
      ClientName: "bogus",
    }
  ]
} as ListUserPoolClientsCommandOutput);

const testLookup = () => {
  const signupLink = new SignupLink('EttCognito-userpool');
  // RESUME NEXT: write these tests.
}