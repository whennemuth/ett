import { lookupRole, removeUserFromUserpool } from '../../_lib/cognito/Lookup';
import { DAOUser, DAOFactory } from '../../_lib/dao/dao';
import { Role, UserFields, User, Invitation, Roles } from '../../_lib/dao/entity';
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
  const { userPoolId, region } = event;
  let newUser:User|undefined;
  if( event?.callerContext) {
    const { clientId } = event?.callerContext;

    // Determined what role applies to the "doorway" (userpool client), the newly confirmed cognito user entered through.
    const role:Role|undefined = await lookupRole(userPoolId, clientId, region);

    if(role) {
      // Make a corresponding new user entry in dynamodb.
      newUser = await addUserToDynamodb(event, role);
    }
  }

  // If any of this failed (no new dynamodb entry made), erase the users presence in cognito.
  if( ! newUser) {
    const errmsg = 'Post cognito signup confirmation error.'
    if(event.request && event.request.userAttributes) {
      const { email } = event.request.userAttributes;
      if(email) {
        await removeUserFromUserpool(userPoolId, email, region);
        throw new Error(`${errmsg} User rolled back from userpool: ${email}`);
      }
    }
    throw new Error(errmsg);
  }

  return event;
}

/**
 * 
 * @param event 
 * @param role 
 * @returns 
 */
const addUserToDynamodb = async (event:PostSignupEventType, role:Role):Promise<User|undefined> => {
  
  if( ! event.request || ! event.request.userAttributes) {
    console.log('ERROR: Attributes are missing from the event');
    return;
  }

  const { sub, email, email_verified, phone_number, 'cognito:user_status':status } = event.request.userAttributes;
  const goodStatus = ( status && status.toUpperCase() == 'CONFIRMED' );
  const emailVerified = ( email_verified && email_verified.toLowerCase() == 'true' );
  let invalidMsg:string|undefined;

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
    return;
  }

  // Lookup the original invitation for the email to get the entity_id, fullname and title values:
  const invitation = await scrapeUserValuesFromInvitation(email, role);

  if( ! invitation) return;

  let user:User;
  user = {
    [UserFields.email]: email,
    [UserFields.entity_id]: invitation.entity_id,
    [UserFields.fullname]: invitation.fullname,
    [UserFields.title]: invitation.title,
    [UserFields.phone_number]: phone_number,
    [UserFields.sub]: sub,
    [UserFields.role]: role
  };

  const daoUser = DAOFactory.getInstance({ DAOType: 'user', Payload: user }) as DAOUser;
  try {
    await daoUser.create();
  } catch (e) {
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

  // Filter off invitations that are retracted, unconsented, for other roles, or not to the expected entity.
  invitations = invitations.filter((invitation) => {
    if(invitation.retracted_timestamp) return false;
    if( ! invitation.acknowledged_timestamp) return false;
    if( ! invitation.consented_timestamp) return false;
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
  // to the same person before that person had a chance to consent to and setup an account against the first invitation.
  return invitations[0];
}
