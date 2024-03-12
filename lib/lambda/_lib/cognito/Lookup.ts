import { 
  CognitoIdentityProviderClient, 
  ListUserPoolClientsCommand, 
  ListUserPoolClientsRequest, 
  ListUserPoolClientsCommandOutput,
  UserPoolClientDescription,
  AdminGetUserCommand,
  AdminGetUserRequest,
  AdminGetUserCommandOutput,
  AttributeType,
  ListUserPoolsCommand,
  ListUserPoolsCommandOutput,
  UserPoolDescriptionType,
  AdminDeleteUserRequest,
  AdminDeleteUserCommand,
  AdminDeleteUserCommandOutput
} from '@aws-sdk/client-cognito-identity-provider';
import { Role, Roles } from '../dao/entity';

/**
 * A cognito post signup confirmation event will indicate a specific user pool client ID. This client needs to
 * be looked up by that ID in order to get its name. A portion of that name will indicate a specific role as 
 * part of a naming convention.
 * @param userPoolId 
 * @param clientId 
 * @returns 
 */
export const lookupRole = async (userPoolId:string, clientId:string, region:string):Promise<Role|undefined> => {
  try {
    let roleStr = '';
    let role:Role | undefined;
    if(userPoolId && clientId) {
      const client = new CognitoIdentityProviderClient({ region });
      const input:ListUserPoolClientsRequest = {
        UserPoolId: userPoolId,
        MaxResults: 10,
      };
      const command = new ListUserPoolClientsCommand(input);
      const response:ListUserPoolClientsCommandOutput = await client.send(command);
      const clients:UserPoolClientDescription[] = response.UserPoolClients || [];
      // Iterate over the user pool clients and look for one that matches the one in the event.
      for(var i=0; i<clients.length; i++ ) {
        const client:UserPoolClientDescription = clients[i];
        if(client.UserPoolId == userPoolId && client.ClientId == clientId) {
          // By convention, the userpool client is named such that the value is prepended with the role.
          roleStr = client.ClientName?.split('-')[0] || '';
          var matched = Object.keys(Roles).find(s => {
            return s == roleStr;
          });
          if(matched) {
            role = Roles[roleStr as Role];
            break;
          }
        } 
      }
    }
    return role;
  }
  catch(e) {
    console.log(e);
    return;
  }
}


/**
 * Lookup the ID of a userpool client based on its name.
 * @param userpoolName 
 * @returns 
 */
export const lookupUserPoolId = async (userpoolName:string, region:string):Promise<string|undefined> => {
  const client = new CognitoIdentityProviderClient( { region } );
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
export const lookupUserPoolClientId = async (UserPoolId:string, role:Role, region:string):Promise<string|undefined> => {
  const client = new CognitoIdentityProviderClient( { region } );
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

/**
 * From the username (sub) attribute of a cognito user, lookup that user and obtain the value of the specified attribute.
 * @param UserPoolId 
 * @param Username 
 * @param attributeName 
 * @param region 
 * @returns 
 */
const lookupAttribute = async (UserPoolId:string, Username:string, attributeName:string, region:string):Promise<string|undefined> => {
  const client = new CognitoIdentityProviderClient({ region });
  const input = { UserPoolId, Username } as AdminGetUserRequest;
  const command = new AdminGetUserCommand(input);
  const response = await client.send(command) as AdminGetUserCommandOutput;
  const emailAttribute = response?.UserAttributes?.find((a:AttributeType) => {
    return a.Name == attributeName;
  });
  return emailAttribute?.Value;

}

/**
 * From the username (sub) attribute of a cognito user, lookup that user and obtain its email attribute.
 * @param UserPoolId 
 * @param Username 
 * @param region 
 * @returns 
 */
export const lookupEmail = async (UserPoolId:string, Username:string, region:string):Promise<string|undefined> => {
  return await lookupAttribute(UserPoolId, Username, 'email', region);
}

/**
 * From the username (sub) attribute of a cognito user, lookup that user and obtain its email attribute.
 * @param UserPoolId 
 * @param Username 
 * @param region 
 * @returns 
 */
export const lookupPhoneNumber = async (UserPoolId:string, Username:string, region:string):Promise<string|undefined> => {
  return await lookupAttribute(UserPoolId, Username, 'phone_number', region);
}

export const removeUserFromUserpool = async (UserPoolId:string, Username:string, region:string):Promise<AdminDeleteUserCommandOutput> => {
  const client = new CognitoIdentityProviderClient({ region });
  const input = { Username, UserPoolId } as AdminDeleteUserRequest;
  const command = new AdminDeleteUserCommand(input);
 return await client.send(command) as AdminDeleteUserCommandOutput;
}