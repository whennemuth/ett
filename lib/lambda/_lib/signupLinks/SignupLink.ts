import { Role, Roles } from "../dao/entity";
import { 
  CognitoIdentityProviderClient, ListUserPoolsCommand, ListUserPoolsCommandOutput,
  ListUserPoolClientsCommand, ListUserPoolClientsCommandOutput, 
  UserPoolDescriptionType, UserPoolClientDescription } from "@aws-sdk/client-cognito-identity-provider";

/**
 * This class provides a method to construct a link that brings the user to the signin screen for a 
 * particular cognito userpool client associated with the specified role.
 */
export class SignupLink {
  private userPoolName:string;
  constructor(userPoolName:string) {
    this.userPoolName = userPoolName;
  }

  public getLinkForRole = async (role:Role):Promise<string|undefined> => {

    const userPoolId = await lookupUserPoolId(this.userPoolName);
    if( ! userPoolId ) {
      console.error('Could not determine userpool ID for signin link');
      return;
    }

    const userPoolClientId = await lookupUserPoolClientId(userPoolId, role);
    if( ! userPoolClientId ) {
      console.error('Could not determine userpool client ID for signin link');
      return;
    }

    const cognitoDomain = process.env.COGNITO_DOMAIN;
    if( ! cognitoDomain ) {
      console.error('Could not determine cognito domain for signin link');
      return;
    }

    const redirectPath = process.env.REDIRECT_PATH;
    if( ! redirectPath ) {
      console.error('Could not determine redirect URI for signin link');
      return;
    }

    const redirectURI = `${cognitoDomain}/${redirectPath}`;

    const params = {
      client_id: userPoolClientId,
      response_type: 'code',
      scope: 'email+openid+phone',
      redirect_uri: encodeURIComponent(`https://${redirectURI}?action=signedup`)
    } as any;

    const queryString = Object.keys(params).map(key => `${key}=${params[key]}`).join('&');
    const signUpUrl = `${cognitoDomain}/signup?${queryString}`;
    return signUpUrl;
  }

}  

/**
 * Lookup the ID of a userpool client based on its name.
 * @param userpoolName 
 * @returns 
 */
const lookupUserPoolId = async (userpoolName:string):Promise<string|undefined> => {
  const client = new CognitoIdentityProviderClient();
  const command = new ListUserPoolsCommand({ MaxResults: undefined });
  const response:ListUserPoolsCommandOutput = await client.send(command);
  let id:string|undefined;
  if(response.UserPools) {
    response.UserPools.forEach((desc:UserPoolDescriptionType) => {
      if(userpoolName === desc.Name) {
        id = desc.Id;
      }
    });
  }
  return id;
}

/**
 * By naming convention, all userpool clients have a name that is prefixed with the role they correspond to.
 * So, given the userpool ID and the role, lookup the userpools clients, identify the one that corresponds 
 * to the role provided, and return its ID.
 * @param UserPoolId 
 * @param role 
 * @returns 
 */
const lookupUserPoolClientId = async (UserPoolId:string, role:Role):Promise<string|undefined> => {
  const client = new CognitoIdentityProviderClient();
  const command = new ListUserPoolClientsCommand({
    UserPoolId, MaxResults:undefined
  });
  const response:ListUserPoolClientsCommandOutput = await client.send(command);
  const clients:UserPoolClientDescription[] = response.UserPoolClients || [];
  let roleStr = '';
  let clientId;
  for(var i=0; i<clients.length; i++ ) {
    const client:UserPoolClientDescription = clients[i];
    if(client.UserPoolId == UserPoolId) {
      // By convention, the userpool client is named such that the value is prepended with the role.
      roleStr = client.ClientName?.split('-')[0] || '';
      var isValidRole = Object.keys(Roles).find(s => {
        return s == roleStr;
      });
      if(isValidRole && role == roleStr) {
        clientId = client.ClientId;
        break;
      }
    } 
  }
  return clientId;
}