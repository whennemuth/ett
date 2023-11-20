import { 
  CognitoIdentityProviderClient, 
  ListUserPoolClientsCommand, 
  ListUserPoolClientsRequest, 
  ListUserPoolClientsCommandOutput,
  UserPoolClientDescription
} from '@aws-sdk/client-cognito-identity-provider';
import { DAO, DAOFactory } from '../../_lib/dao/dao';
import { Roles, Role, UserFields, User } from '../../_lib/dao/entity';
import { PostSignupEventType } from './PostSignupEventType';

/**
 * After a user confirms their signup (uses verification code) in cognito, that event triggers this 
 * lambda to make the corresponding entry for the new user in dynamodb.
 * @param _event 
 * @returns 
 */
export const handler = async (_event:any) => {
  console.log(JSON.stringify(_event, null, 2)); 
  
  const event = _event as PostSignupEventType;
  const { userPoolId, region } = event;
  let newUser:User|undefined;
  if( event?.callerContext) {
    const { clientId } = event?.callerContext;

    // Determined what role applies to the newly confirmed cognito user.
    const role:Role|undefined = await lookupRole(userPoolId, clientId, region);

    if(role) {
      // Make a corresponding new user entry in dynamodb.
      newUser = await addUserToDynamodb(event, role);
    }
  }

  // If any of this failed (no new dynamodb entry made), erase the users presence in cognito.
  if( ! newUser ) {
    await undoCognitoLogin(event);
    throw new Error('Post cognito signup confirmation error.');
  }

  return event;
}

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

export const addUserToDynamodb = async (event:PostSignupEventType, role:Role):Promise<User|undefined> => {
  
  if( ! event?.request?.userAttributes ) {
    console.log('ERROR: Attributes are missing from the event');
    return
  }

  const { sub, email, name, email_verified, 'cognito:user_status':status } = event?.request?.userAttributes;
  const goodStatus = ( status && status.toUpperCase() == 'CONFIRMED' );
  const emailVerified = ( email_verified && email_verified.toLowerCase() == 'true' );
  let invalidMsg:string|undefined;

  if( ! (goodStatus || emailVerified )) {
    invalidMsg = 'User is neither confirmed or verified!'
  }
  else if( ! sub) {
    console.error('Cognito user ID (sub) is missing as an attribute in the event!');
  }
  else if( ! email) {
    console.error('Email is missing as an attribute in the event!');
  }
  else if( ! name) {
    console.error('Full name is missing as an attribute in the event!');
  }
  if(invalidMsg) {
    console.log(`ERROR: ${invalidMsg}`);
    return;
  }

  let user:User|undefined;
  user = {
    [UserFields.email]: email,
    [UserFields.entity_name]: '__UNASSIGNED__',
    [UserFields.fullname]: name,
    [UserFields.sub]: sub,
    [UserFields.role]: role
  }
  const dao:DAO = DAOFactory.getInstance({ DAOType: 'user', Payload: user });
  try {
    await dao.create();
  } catch (e) {
    console.log(e);
    return;
  } 

  return user;
}

/**
 * Making an entry to dynamodb for the user failed for one reason or another. It is invalid state to have 
 * a confirmed cognito user with no matching dynamodb entry, so remove the cognito entry.
 * @param sub 
 */
export const undoCognitoLogin = async (event:PostSignupEventType):Promise<void> => {
  if(event?.request?.userAttributes?.sub) {
    const { sub } = event.request.userAttributes;
  }  
  console.log('TODO: Write this function, and then assert it gets called in the unit tests.');
}