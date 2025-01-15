import exp = require('constants');
import { Role, Roles } from '../dao/entity';
import { SignupLink } from './SignupLink';
import { Actions } from '../../../role/AbstractRole';

const userPoolId = 'us-east-2_J9AbymKIz';
const userPoolName = 'EttCognito-userpool'
const clientId1 = '6lgr9r32asit6hn3ugo9f71hp';
let userPoolIdScenario = 'mismatch';
let clientIdScenario = 'mismatch';

const cloudfrontDomain = 'd3a53ihnef1k0j.cloudfront.net';
const redirectUri =  `https://${cloudfrontDomain}/index.htm`;
const cognitoDomain = 'ett-dev.auth.us-east-2.amazoncognito.com';
process.env.CLOUDFRONT_DOMAIN = cloudfrontDomain;
process.env.COGNITO_DOMAIN = cognitoDomain;
process.env.REDIRECT_URI = redirectUri;
process.env.REGION = 'us-east-2'

/**
 * Define a partial mock for the cognito Lookup.ts module
 */
jest.mock('../cognito/Lookup.ts', () => {
  const originalModule = jest.requireActual('../cognito/Lookup');
  return {
    __esModule: true,
    ...originalModule,
    lookupUserPoolId: async (userpoolName:string):Promise<string|undefined> => {
      return userPoolIdScenario == 'match' ? userPoolId : undefined;
    },
    lookupUserPoolClientId: async (UserPoolId:string, role:Role):Promise<string|undefined> => {
      return clientIdScenario == 'match' ? clientId1 : undefined;
    },    
  }
});

describe('Cognito signup link ', () => {

  it('Should never error out if fed parameters for non-existing user pool', async () => {
    userPoolIdScenario = 'mismatch';
    clientIdScenario = 'match';
    const signupLink = new SignupLink({ userPoolName }); 
    const link = await signupLink.getCognitoLinkForRole(Roles.RE_ADMIN);
    expect(link).toBeUndefined();
  });

  it('Should never error out if fed a role that has no corresponding user pool client', async () => {
    userPoolIdScenario = 'match';
    clientIdScenario = 'mismatch';
    const signupLink = new SignupLink({userPoolName}); 
    const link = await signupLink.getCognitoLinkForRole(Roles.RE_AUTH_IND);
    expect(link).toBeUndefined();
  });

  it('Should return the expected signup link', async () => {
    userPoolIdScenario = 'match';
    clientIdScenario = 'match';
    const signupLink = new SignupLink({userPoolName}); 
    const expectedRedirectParm = encodeURIComponent(`${redirectUri}?action=${Actions.post_signup}&selected_role=${Roles.RE_ADMIN}`);
    const expectedLink = `https://${cognitoDomain}/signup?client_id=${clientId1}&response_type=code&scope=email+openid+phone&redirect_uri=${expectedRedirectParm}`;
    const link = await signupLink.getCognitoLinkForRole(Roles.RE_ADMIN);
    expect(link).toEqual(expectedLink);
  });
});

describe('Registration signup link', () => {

  it('Should incorporate the expected registration link value that targets the bootstrap app', async () => {
    const signupLink = new SignupLink({userPoolName}); 
    let expectedLink = `https://${cloudfrontDomain}/bootstrap/index.htm?action=${Actions.register_entity}`;
    let registrationUri = `https://${cloudfrontDomain}/bootstrap/index.htm`;
    let link = await signupLink.getRegistrationLink({ registrationUri });
    expect(link).toEqual(expectedLink);

    const entity_id='abc123'
    expectedLink = `${expectedLink}&entity_id=${entity_id}`;
    link = await signupLink.getRegistrationLink({ registrationUri, entity_id });
    expect(link).toEqual(expectedLink);

    registrationUri = 'https://mydomain/bootstrap/path/to/something';
    expectedLink = `${registrationUri}?action=${Actions.register_entity}&entity_id=${entity_id}`;
    link = await signupLink.getRegistrationLink({ entity_id, registrationUri });
    expect(link).toEqual(expectedLink);

    let email = 'invitee@gmail.com';
    expectedLink = `${registrationUri}?action=${Actions.register_entity}&entity_id=${entity_id}&email=${email}`;
    link = await signupLink.getRegistrationLink({ entity_id, registrationUri, email });
    expect(link).toEqual(expectedLink);
  });


  it('Should incorporate the expected registration link value that targets the default app', async () => {
    const signupLink = new SignupLink({userPoolName}); 
    let expectedLink = `https://${cloudfrontDomain}`;
    let link = await signupLink.getRegistrationLink({});
    expect(link).toEqual(expectedLink);

    const entity_id='abc123'
    link = await signupLink.getRegistrationLink({ entity_id });
    expect(link).toEqual(expectedLink);

    const registrationUri = 'https://mydomain/path/to/something';
    expectedLink = `${registrationUri}?entity_id=${entity_id}`;
    link = await signupLink.getRegistrationLink({ entity_id, registrationUri });
    expect(link).toEqual(expectedLink);

    let email = 'invitee@gmail.com';
    expectedLink = `${registrationUri}?entity_id=${entity_id}&email=${email}`;
    link = await signupLink.getRegistrationLink({ entity_id, registrationUri, email });
    expect(link).toEqual(expectedLink);
  })

})