import { 
  CognitoIdentityProviderClient, 
  ListUserPoolClientsCommand, 
  ListUserPoolClientsRequest, 
  ListUserPoolClientsCommandOutput,
  UserPoolClientDescription
} from '@aws-sdk/client-cognito-identity-provider';
import { Role, Roles } from '../../_lib/dao/entity';

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