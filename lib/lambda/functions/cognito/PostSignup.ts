import { lookupRole, removeUserFromUserpool } from '../../_lib/cognito/Lookup';
import { DAOUser, DAOFactory, DAOConsenter } from '../../_lib/dao/dao';
import { Role, UserFields, User, Invitation, Roles, Consenter, ConsenterFields } from '../../_lib/dao/entity';
import { PostSignupEventType } from './PostSignupEventType';
import { ENTITY_WAITING_ROOM } from '../../_lib/dao/dao-entity';

const debugLog = (entry:String) => { 
  if(process.env?.DEBUG === 'true') {
    console.log(entry);
  }
};

/**
 * After a user confirms their signup (uses verification code) in cognito, that event triggers this 
 * lambda to make the corresponding entry for the new user in dynamodb.
 * @param _event 
 * @returns 
 */
export const handler = async (_event:any) => {
  debugLog(JSON.stringify(_event, null, 2)); 
  
  const event = _event as PostSignupEventType;

  let role:Role|undefined;

  /** Call this function to remove the user from the cognito userpool */
  const removeCognitoUser = async (reason:string) => {
    const errmsg = 'Post cognito signup confirmation error.'
    if(event.request && event.request.userAttributes) {
      const { email } = event.request.userAttributes;
      if(email) {
        await removeUserFromUserpool(userPoolId, email, region);
        if(`${role}` == Roles.CONSENTING_PERSON) {
          let dao = DAOFactory.getInstance({ DAOType: 'consenter', Payload: { email }}) as DAOConsenter;
          const consenter = await dao.read() as Consenter;
          if( ! consenter.sub) {
            dao.Delete();
          }
          else {
            reason = `${reason} AND ${email} already has a cognito account`;
          }
        }
        throw new Error(`${errmsg} User rolled back from userpool: ${email}, due to ${reason}`);
      }
    }
    throw new Error(errmsg);
  }

  const { userPoolId, region, callerContext } = event;

  if( ! userPoolId) {
    await removeCognitoUser('Missing userPoolId');
  }

  if( ! callerContext) {
    await removeCognitoUser('Missing callerContext');
  }

  const { clientId } = callerContext;

  if( ! clientId ) {
    await removeCognitoUser('Missing clientId');
  }

  // Determine what role applies to the "doorway" (userpool client), the newly confirmed cognito user entered through.
  role = await lookupRole(userPoolId, clientId, region);

  // Throw an error if there is anything wrong with the role or the event
  const invalidMsg = role ? checkEvent(event) : 'Role lookup failure!';
  if (invalidMsg) {
    await removeCognitoUser(invalidMsg);
  }

  if(role == Roles.CONSENTING_PERSON) {
    // Update the existing database record for the consenter with sub and phone_number
    const consenter:Consenter|undefined = await updateConsenterInDatabase(event);
    if( ! consenter) {
      // If consenter update failed (no new dynamodb entry made), erase the users presence in cognito AND the database.
      await removeCognitoUser(`Failed to update new ${role} in dynamodb`);
    }
  }
  else {
    // Make a corresponding new user entry in dynamodb.
    const newUser:User|undefined = await addUserToDatabase(event, role!);      
    if( ! newUser) {
      // If user creation failed (no new dynamodb entry made), erase the users presence in cognito.
      await removeCognitoUser(`Failed to create new ${role} in dynamodb`);
    }
  }
  

  // Returning the event without change means a "pass" and cognito will carry signup to completion.
  return event;
}

/**
 * Ensure the incoming event contains all expected fields with valid values.
 * @param event 
 * @param role 
 * @returns 
 */
const checkEvent = (event:PostSignupEventType):string|undefined => {
  let invalidMsg:string|undefined;

  if( ! event.request || ! event.request.userAttributes) {
    invalidMsg = 'ERROR: Attributes are missing from the event';
    console.log(invalidMsg);
    return invalidMsg;
  }

  const { sub, email, email_verified, phone_number, 'cognito:user_status':status } = event.request.userAttributes;
  const goodStatus = ( status && status.toUpperCase() == 'CONFIRMED' );
  const emailVerified = ( email_verified && email_verified.toLowerCase() == 'true' );

  if( ! goodStatus) {
    invalidMsg = 'User is not confirmed!';
  }
  else if( ! emailVerified) {
    invalidMsg = 'Users email has not been verified yet!';
  }
  else if( ! sub) {
    invalidMsg = 'Cognito user ID (sub) is missing as an attribute in the event!';
  }
  else if( ! email) {
    invalidMsg = 'Email is missing as an attribute in the event!';
  }
  else if( ! phone_number) {
    invalidMsg = 'Phone number is missing as an attribute in the event!';
  }
  if(invalidMsg) {
    console.error(`ERROR: ${invalidMsg}`);
  }
  return invalidMsg;
}

/**
 * Update the consenter in the database with the coginito sub value and the phone_number
 * @param event 
 * @returns 
 */
const updateConsenterInDatabase = async (event:PostSignupEventType):Promise<Consenter|undefined> => {
  const { sub, email, phone_number } = event.request.userAttributes;

  const consenter = {
    [ConsenterFields.email]: email,
    [ConsenterFields.phone_number]: phone_number,
    [ConsenterFields.sub]: sub,
  } as Consenter;

  const daoConsenter = DAOFactory.getInstance({ DAOType: 'consenter', Payload:consenter}) as DAOConsenter;
  try {
    await daoConsenter.update();
  }
  catch(e) {
    console.error(e);
    return;
  }

  return consenter;
}

/**
 * Create the user in the database.
 * @param event 
 * @param role 
 * @returns 
 */
const addUserToDatabase = async (event:PostSignupEventType, role:Role):Promise<User|undefined> => {
  const { sub, email, phone_number } = event.request.userAttributes;

  // Lookup the original invitation for the email to get the entity_id, fullname and title values:
  const invitation = await scrapeUserValuesFromInvitation(email, role);

  if( ! invitation) return;

  const user = {
    [UserFields.email]: email,
    [UserFields.entity_id]: invitation.entity_id,
    [UserFields.fullname]: invitation.fullname,
    [UserFields.title]: invitation.title,
    [UserFields.phone_number]: phone_number,
    [UserFields.sub]: sub,
    [UserFields.role]: role
  } as User;

  const daoUser = DAOFactory.getInstance({ DAOType: 'user', Payload: user }) as DAOUser;
  try {
    await daoUser.create();
  } 
  catch (e) {
    console.error(e);
    return;
  } 

  return user;
}

/**
 * Find the original invitation for the user who is signing up.
 * @param email 
 * @param role 
 * @returns 
 */
const scrapeUserValuesFromInvitation = async (email:string, role:Role):Promise<Invitation|null> => {

  // Lookup any invitations for the email:
  const daoInvitation = DAOFactory.getInstance({
    DAOType: 'invitation',
    Payload: {
      email
    } as Invitation
  });
  let invitations = await daoInvitation.read() as Invitation[];

  // Filter off invitations that are retracted, unregistered, for other roles, or not to the expected entity.
  invitations = invitations.filter((invitation) => {
    if(invitation.retracted_timestamp) return false;
    if( ! invitation.acknowledged_timestamp) return false;
    if( ! invitation.registered_timestamp) return false;
    if( invitation.role != role) return false;
    // Should NEVER find these role and entity_id combinations for associated invitation directly after signup
    // An RE_ADMIN is always in the waiting room BEFORE they create their entity.
    // A SYS_ADMIN is always in the waiting room since they transcend entities.
    if(role == Roles.RE_AUTH_IND && invitation.entity_id == ENTITY_WAITING_ROOM) return false;
    if(role == Roles.RE_ADMIN && invitation.entity_id != ENTITY_WAITING_ROOM) return false;
    if(role == Roles.SYS_ADMIN && invitation.entity_id != ENTITY_WAITING_ROOM) return false;
    return true;
  });

  // Handle lookup failure
  if(invitations.length == 0) {
    console.error(`ERROR: Cannot find qualifying invitation for ${email} for fullname and title - User creation cancelled.`);
    return null;
  }

  // There should be only one result, but multiple results just means a SYS_ADMIN sent a subsequent invitation
  // to the same person before that person had a chance to register to and setup an account against the first invitation.
  return invitations[0];
}



/**
 * RUN MANUALLY:
 */
const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_POST_SIGNUP') {

  const mockEvent = {
    "version": "1",
    "region": "us-east-2",
    "userPoolId": "us-east-2_FFxJkLmaJ",
    "userName": "51bbc580-30e1-7065-2eb0-1ac0362e7d60",
    "callerContext": {
        "awsSdkVersion": "aws-sdk-unknown-unknown",
        "clientId": "1c74v2fe28ti22gf4fala0ce62"
    },
    "triggerSource": "PostConfirmation_ConfirmSignUp",
    "request": {
        "userAttributes": {
            "sub": "51bbc580-30e1-7065-2eb0-1ac0362e7d60",
            "email_verified": "true",
            "cognito:user_status": "CONFIRMED",
            "phone_number_verified": "false",
            "phone_number": "+6172224444",
            "email": "asp.au.edu@warhen.work"
        }
    },
    "response": {}
  }

  handler(mockEvent).then(() => {
    console.log('done');
  })
  .catch((reason) => {
    console.error(reason);
  });
}