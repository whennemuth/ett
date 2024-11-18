import { CONFIG } from '../../../../contexts/IContext';
import { debugLog, log } from '../../Utils';
import { lookupRole, removeUserFromUserpool } from '../../_lib/cognito/Lookup';
import { Configurations } from '../../_lib/config/Config';
import { DAOConsenter, DAOEntity, DAOFactory, DAOUser } from '../../_lib/dao/dao';
import { ENTITY_WAITING_ROOM } from '../../_lib/dao/dao-entity';
import { UserCrud } from '../../_lib/dao/dao-user';
import { ConfigNames, ConfigTypes, Consenter, ConsenterFields, Entity, Invitation, Role, Roles, User, UserFields, YN } from '../../_lib/dao/entity';
import { scheduleStaleEntityVacancyHandler } from '../authorized-individual/correction/EntityCorrection';
import { updateReAdminInvitationWithNewEntity } from '../re-admin/ReAdminUser';
import { PostSignupEventType } from './PostSignupEventType';

/**
 * After a user confirms their signup (uses verification code) in cognito, that event triggers this 
 * lambda to make the corresponding entry for the new user in dynamodb.
 * @param _event 
 * @returns 
 */
export const handler = async (_event:any) => {
  debugLog(_event); 
  
  const event = _event as PostSignupEventType;

  let role:Role|undefined;
  let invitation:Invitation|null = null;

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
  const addReAdminToDatabase = async (event:PostSignupEventType):Promise<User|undefined> => {
    const { sub, email, phone_number } = event.request.userAttributes;

    // Lookup the original invitation for the email to get the entity_id, fullname and title values:
    invitation = await scrapeUserValuesFromInvitation(email, Roles.RE_ADMIN);

    if( ! invitation) return;

    let { entity_id, entity_name, fullname, title } = invitation;

    if(entity_name && entity_name != ENTITY_WAITING_ROOM) {
      // Create the entity
      const daoEntity = DAOFactory.getInstance({ 
        DAOType: 'entity', 
        Payload: { entity_name, description:entity_name } as Entity
      }) as DAOEntity;
      await daoEntity.create();
      entity_id = daoEntity.id();
    }

    const user = {
      [UserFields.email]: email,
      [UserFields.entity_id]: entity_id,
      [UserFields.fullname]: fullname,
      [UserFields.title]: title,
      [UserFields.phone_number]: phone_number,
      [UserFields.sub]: sub,
      [UserFields.role]: Roles.RE_ADMIN
    } as User;

    const daoUser = DAOFactory.getInstance({ DAOType: 'user', Payload: user }) as DAOUser;
    try {
      await daoUser.create();

      if(entity_id && entity_id != ENTITY_WAITING_ROOM) {
        await updateReAdminInvitationWithNewEntity(email, entity_id);
      }
    } 
    catch (e) {
      console.error(e);
      return;
    } 

    return user;
  }

  const addAuthIndToDatabase = async (event:PostSignupEventType):Promise<User|undefined> => {
    const { sub, email, phone_number } = event.request.userAttributes;
    // Lookup the original invitation for the email to get the entity_id, fullname and title values:
    invitation = await scrapeUserValuesFromInvitation(email, Roles.RE_AUTH_IND);
    if( ! invitation) return;
    return addUserToDatabase(event, Roles.RE_AUTH_IND, invitation);
  }

  const addSysAdminToDatabase = async (event:PostSignupEventType):Promise<User|undefined> => {
    const { sub, email, phone_number } = event.request.userAttributes;
    // Lookup the original invitation for the email to get the entity_id, fullname and title values:
    invitation = await scrapeUserValuesFromInvitation(email, Roles.SYS_ADMIN);
    if( ! invitation) return;
    return addUserToDatabase(event, Roles.SYS_ADMIN, invitation);
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

  let person:User|Consenter|undefined;

  switch(role as Roles) {
    case Roles.SYS_ADMIN:
      person = await addSysAdminToDatabase(event);
      break;

    case Roles.RE_ADMIN:
      person = await addReAdminToDatabase(event);      
      break;

    case Roles.RE_AUTH_IND:
      person = await addAuthIndToDatabase(event);      
      break;

    case Roles.CONSENTING_PERSON:
      // Update the existing database record for the consenter with sub and phone_number
      person = await updateConsenterInDatabase(event);
      break;
  }

  if( ! person) {
    // If consenter update failed (no new dynamodb entry made), erase the users presence in cognito AND the database.
    await removeCognitoUser(`Failed to update new ${role} in dynamodb`);
  }

  // If, with the signup of the current user, the entity is nonetheless not fully staffed, create a delayed execution
  // that will terminate the entity if the remaining user(s) do not register within the time dictated by policy.
  if((role == Roles.RE_ADMIN || role == Roles.RE_AUTH_IND) && invitation) {
    const { entity_id, entity_name } = invitation as Invitation;
    const activeUsers = (await UserCrud({ entity_id } as User).read() as User[]).filter(u => u.active == YN.Yes);
    const asps = activeUsers.filter(u => u.role == Roles.RE_ADMIN);
    const ais = activeUsers.filter(u => u.role == Roles.RE_AUTH_IND);
    const configs = new Configurations();
    const aiMin = parseInt((await configs.getAppConfig(ConfigNames.AUTH_IND_NBR)).value);
    const entity = { entity_id, entity_name } as Entity;
    if(asps.length == 0) {
      // This is probably not possible in a post signup scenario (ai wouldn't register before an asp), but account for it.
      log(entity, 'Scheduling delayed execution for handling overdue vacancy of ASP');
      await scheduleStaleEntityVacancyHandler(entity, Roles.RE_ADMIN);
    }
    else if(ais.length < aiMin) {
      log(entity, 'Scheduling delayed execution for handling overdue vacancy of Authorized Individual');
      await scheduleStaleEntityVacancyHandler(entity, Roles.RE_AUTH_IND);
    }
  }

  // Returning the event without change means a "pass" and cognito will carry signup to completion.
  return event;
}




const addUserToDatabase = async (event:PostSignupEventType, role:Role, invitation:Invitation):Promise<User|undefined> => {
  const { sub, email, phone_number } = event.request.userAttributes;

  let { entity_id, fullname, title } = invitation;

  const user = {
    [UserFields.email]: email,
    [UserFields.entity_id]: entity_id,
    [UserFields.fullname]: fullname,
    [UserFields.title]: title,
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
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/cognito/PostSignup.ts')) {

  // Create a reduced app config just for this test
  const { AUTH_IND_NBR } = ConfigNames;
  const configs = { useDatabase:false, configs: [
    { name: AUTH_IND_NBR, value: '2', config_type: ConfigTypes.NUMBER, description: 'testing' },
  ]} as CONFIG;
  
  // Set the config as an environment variable
  process.env[Configurations.ENV_VAR_NAME] = JSON.stringify(configs);

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