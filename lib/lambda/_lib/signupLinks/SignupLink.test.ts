import 'aws-sdk-client-mock-jest';
import { mockClient } from 'aws-sdk-client-mock'
import { CognitoIdentityProviderClient, ListUserPoolsCommand, ListUserPoolClientsCommand, 
  ListUserPoolsCommandOutput, ListUserPoolClientsCommandOutput } from "@aws-sdk/client-cognito-identity-provider";
import { SignupLink } from './SignupLink';
import { Roles } from '../dao/entity';

// Mock the cognito idp client
const cognitoIdpClientMock = mockClient(CognitoIdentityProviderClient);
const userPoolId = 'us-east-2_J9AbymKIz';
const userPoolName = 'EttCognito-userpool'
const clientId1 = '6lgr9r32asit6hn3ugo9f71hp';
const clientId2 = '6rmo8njptnv0a2nd9skuq9hr04';

// Mock the listing of userpools
cognitoIdpClientMock.on(ListUserPoolsCommand).resolves({
  UserPools: [{ 
    Id: userPoolId,
    Name: userPoolName,
    Status: "Enabled",
  }]
} as ListUserPoolsCommandOutput);

// Mock the listing of userpool clients for the userpool
cognitoIdpClientMock.on(ListUserPoolClientsCommand).resolves({
  UserPoolClients: [
    {
      ClientId: clientId1,
      UserPoolId: userPoolId,
      ClientName: `${Roles.RE_ADMIN}-ett-userpool-client`,
    },
    {
      ClientId: clientId2,
      UserPoolId: userPoolId,
      ClientName: `${Roles.HELLO_WORLD}-ett-userpool-client`,
    },
    {
      ClientId: "bogus",
      UserPoolId: userPoolId,
      ClientName: "bogus",
    }
  ]
} as ListUserPoolClientsCommandOutput);

const testLookup = () => {
  const signupLink = new SignupLink('EttCognito-userpool');

  describe('Signup link', () => {

    const domain = 'ett-dev.auth.us-east-2.amazoncognito.com';
    const redirectURI =  'd3a53ihnef1k0j.cloudfront.net/index.htm';
    process.env.COGNITO_DOMAIN = domain;
    process.env.REDIRECT_URI = redirectURI;

    it('Should never error out if fed parameters for non-existing user pool', async () => {
      const signupLink = new SignupLink('bogus_name'); 
      const link = await signupLink.getLinkForRole(Roles.RE_ADMIN);
      expect(link).toBeUndefined();
    });

    it('Should never error out if fed a role that has no correspoinding user pool client', async () => {
      const signupLink = new SignupLink(userPoolName); 
      const link = await signupLink.getLinkForRole(Roles.RE_AUTH_IND);
      expect(link).toBeUndefined();
    });

    it('Should return the expected signup link', async () => {
      const signupLink = new SignupLink(userPoolName); 
      const expectedRedirectParm = encodeURIComponent(`https://${redirectURI}?action=signedup`);
      const expectedLink = `https://${domain}/signup?client_id=${clientId1}&response_type=code&scope=email+openid+phone&redirect_uri=${expectedRedirectParm}`;
      const link = await signupLink.getLinkForRole(Roles.RE_ADMIN);
      expect(link).toEqual(expectedLink);
    });
  });
}

testLookup();