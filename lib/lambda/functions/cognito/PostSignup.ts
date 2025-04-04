import { CONFIG, IContext } from '../../../../contexts/IContext';
import { LambdaProxyIntegrationResponse } from '../../../role/AbstractRole';
import { debugLog, error, isOk, log, warn } from '../../Utils';
import { lookupRole, removeUserFromUserpool } from '../../_lib/cognito/Lookup';
import { Configurations } from '../../_lib/config/Config';
import { DAOConsenter, DAOEntity, DAOFactory, DAOUser } from '../../_lib/dao/dao';
import { ENTITY_WAITING_ROOM, EntityCrud } from '../../_lib/dao/dao-entity';
import { UserCrud } from '../../_lib/dao/dao-user';
import { ConfigNames, ConfigTypes, Consenter, ConsenterFields, Entity, Invitation, Role, roleFullName, Roles, User, UserFields, YN } from '../../_lib/dao/entity';
import { scheduleStaleEntityVacancyHandler } from '../authorized-individual/correction/EntityCorrection';
import { sendConsenterRegistrationForm } from '../consenting-person/ConsentingPerson';
import { sendEntityRegistrationForm, updateReAdminInvitationWithNewEntity, UserInfo } from '../re-admin/ReAdminUser';
import { PostSignupEventType } from './PostSignupEventType';

/**
 * After a user confirms their signup (uses verification code) in cognito, that event triggers this 
 * lambda to make the corresponding entry for the new user in dynamodb.
 * @param _event 
 * @returns 
 */
export const handler = async (_event:any) => {
  debugLog(_event); 

  if(_event?.request?.userAttributes?.email) {
    _event.request.userAttributes.email = _event?.request?.userAttributes?.email.toLowerCase();
  }

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
      console.error(invalidMsg);
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

  const addReAdminToDatabase = async (event:PostSignupEventType):Promise<User|undefined> => {
    const { sub, email, phone_number } = event.request.userAttributes;

    // Lookup the original invitation for the email to get the entity_id, fullname and title values:
    invitation = await scrapeUserValuesFromInvitations(getUserInvitationsForRole, email, Roles.RE_ADMIN);

    if( ! invitation) return;

    let { entity_id, entity_name, fullname, title } = invitation;
    let user:User;

    try {
      let preExistingEntity:Entity|null = null;
      if(entity_id != ENTITY_WAITING_ROOM) {
        preExistingEntity = await EntityCrud({ entity_id } as Entity).read() as Entity;
      }

      /**
       * @returns Indication that the RE_ADMIN who is signing up is doing so as part of entity registration.
       * Alternatively, the RE_ADMIN could simply be replacing a prior RE_ADMIN in an already existing entity.
       */
      const entityBeingRegistered = ():boolean => {
        return (preExistingEntity == null && entity_name && entity_name != ENTITY_WAITING_ROOM) ? true : false;
      }

      // Create the entity if indicated
      if(entityBeingRegistered()) {
        const daoEntity = DAOFactory.getInstance({ 
          DAOType: 'entity', 
          Payload: { entity_name, description:entity_name } as Entity
        }) as DAOEntity;
        await daoEntity.create();
        entity_id = daoEntity.id();
        // Update the invitation object locally so that scheduleStaleEntityVacancyHandler can be configured properly.
        invitation.entity_id = entity_id;
        invitation.entity_name = entity_name;
      }

      // Add the user to the database
      user = {
        [UserFields.email]: email,
        [UserFields.entity_id]: entity_id,
        [UserFields.fullname]: fullname,
        [UserFields.title]: title,
        [UserFields.phone_number]: phone_number,
        [UserFields.sub]: sub,
        [UserFields.role]: Roles.RE_ADMIN
      } as User;
      const daoUser = DAOFactory.getInstance({ DAOType: 'user', Payload: user }) as DAOUser;
      await daoUser.create();

      // Update the original invitation to reflect the name of the entity the user now belongs to (if indicated).
      if(entityBeingRegistered()) {
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
    invitation = await scrapeUserValuesFromInvitations(getUserInvitationsForRole, email, Roles.RE_AUTH_IND);
    if( ! invitation) return;
    return addUserToDatabase(event, Roles.RE_AUTH_IND, invitation);
  }

  const addSysAdminToDatabase = async (event:PostSignupEventType):Promise<User|undefined> => {
    const { sub, email, phone_number } = event.request.userAttributes;
    // Lookup the original invitation for the email to get the entity_id, fullname and title values:
    invitation = await scrapeUserValuesFromInvitations(getUserInvitationsForRole, email, Roles.SYS_ADMIN);
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
    const activeUsers = (await UserCrud({ userinfo: { entity_id } as User }).read() as User[]).filter(u => u.active == YN.Yes);
    const asps = activeUsers.filter(u => u.role == Roles.RE_ADMIN);
    const ais = activeUsers.filter(u => u.role == Roles.RE_AUTH_IND);
    const configs = new Configurations();
    const aiMin = parseInt((await configs.getAppConfig(ConfigNames.AUTH_IND_NBR)).value);
    const entity = { entity_id, entity_name } as Entity;
    if(asps.length == 0) {
      // This is probably not possible in a post signup scenario (ai wouldn't register before an asp), but account for it.
      log(entity, `Scheduling delayed execution for handling overdue vacancy of ${roleFullName(Roles.RE_ADMIN)}`);
      await scheduleStaleEntityVacancyHandler(entity, Roles.RE_ADMIN);
    }
    else if(ais.length < aiMin) {
      log(entity, `Scheduling delayed execution for handling overdue vacancy of ${roleFullName(Roles.RE_AUTH_IND)}`);
      await scheduleStaleEntityVacancyHandler(entity, Roles.RE_AUTH_IND);
    }
  }

  const { signup_parameter='register' } = invitation ?? {
    signup_parameter: 'register'
  } as Invitation;

  switch(signup_parameter) {
    case 'register':
      // Send registration pdf forms via email to all users in the entity.
      await sendRegistrationForm(person!, role!);
      break;
    case 'amend':
      // The user is signing up to replace a prior user in the same role in the same entity.
      log('Amendment signup detected. Delaying registration form emails to users until after the amendment is carried out.');
      break;
    default:
      warn(`Unrecognized signup_parameter: ${signup_parameter}`);
      break;
  }

  // Returning the event without change means a "pass" and cognito will carry signup to completion.
  return event;
}


/**
 * Create the user in the database.
 * @param event 
 * @param role 
 * @param invitation 
 * @returns 
 */
const addUserToDatabase = async (event:PostSignupEventType, role:Role, invitation:Invitation):Promise<User|undefined> => {
  const { sub, email, phone_number } = event.request.userAttributes;

  let { entity_id, fullname, title, delegate } = invitation;

  const user = {
    [UserFields.email]: email,
    [UserFields.entity_id]: entity_id,
    [UserFields.fullname]: fullname,
    [UserFields.title]: title,
    [UserFields.phone_number]: phone_number,
    [UserFields.sub]: sub,
    [UserFields.role]: role,
    [UserFields.delegate]: delegate
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

export type RoleInvitationsLookup = (email:string, role:Role) => Promise<Invitation[]>;

/**
 * Find the original invitation for the user who is signing up.
 * @param email 
 * @param role 
 * @returns 
 */
export const getUserInvitationsForRole:RoleInvitationsLookup = async (email:string, role:Role):Promise<Invitation[]> => {
  // Lookup any invitations for the email:
  const daoInvitation = DAOFactory.getInstance({ DAOType: 'invitation', Payload: { email } as Invitation });
  const invitations = await daoInvitation.read() as Invitation[];
  return invitations.filter(i => i.role == role);
}

/**
 * Find the original invitation for the user who is signing up.
 * @param invitations 
 * @param email 
 * @param role 
 * @returns 
 */
export const scrapeUserValuesFromInvitations = async (invitationLookup:RoleInvitationsLookup, email:string, role:Role):Promise<Invitation|null> => {
  
  // Filter off invitations that are retracted, unregistered, for other roles, or not to the expected entity.
  let invitations = await invitationLookup(email, role) as Invitation[];
  invitations = invitations.filter((invitation) => {
    const {registered_timestamp, retracted_timestamp, entity_id } = invitation;
    if(retracted_timestamp) return false;
    if( ! registered_timestamp) return false;
    if(role == Roles.RE_AUTH_IND && entity_id == ENTITY_WAITING_ROOM) return false;
    if(role == Roles.RE_ADMIN && entity_id != ENTITY_WAITING_ROOM) {
      log(`${email} is being invited to ${entity_id} to replace a prior ${role}`);
    }
    if(role == Roles.SYS_ADMIN && entity_id != ENTITY_WAITING_ROOM) {
      // A SYS_ADMIN is always in the waiting room since they transcend entities.
      return false;
    }
    return true;
  });

  // Handle lookup failure
  if(invitations.length == 0) {
    console.error(`Cannot find qualifying invitation for ${email} for fullname and title - User creation cancelled.`);
    return null;
  }

  // There should usually be only one result, but multiple results just means a subsequent invitation was sent
  // to the same person before that person had a chance to register to and setup an account against the first 
  // invitation. Or, the corresponding user was removed as part of an entity ammendment, and then invited back
  // again (there would now be more than one invitation for the same email address).

  // Return the most recent invitation
  invitations.sort((a, b) => {
    return new Date(b.sent_timestamp).getTime() - new Date(a.sent_timestamp).getTime();
  });
  
  const scrapedInvitation = invitations[0];
  log(scrapedInvitation, 'Scraped Invitation');
  return scrapedInvitation;
}

/**
 * Send the registration form to the individual signing up as an attachment in an email.
 * @param consenter 
 * @param entityName 
 */
export const sendRegistrationForm = async (person:User|Consenter, role:Role, entityName?:string):Promise<void> => {
  let sent = false;
  let response:LambdaProxyIntegrationResponse;
  let _email:string = 'Unknown email';
  log({ person, role, entityName }, 'Sending registration form email');
  try {
    switch(role) {
      case Roles.CONSENTING_PERSON:
        const consenter = person as Consenter;
        _email = consenter.email;
        entityName = entityName ?? 'Any entity registered with ETT';
        response = await sendConsenterRegistrationForm(consenter, entityName);
        break;
      default:
        // Either RE_ADMIN or RE_AUTH_IND
        const { email, role, } = person as User;
        _email = email;
        response = await sendEntityRegistrationForm({
          email, 
          role, 
          termsHref: getTermsHref(),
          loginHref: getLoginHref(), 
          /**
           * Cannot set a role-specific url since the registration form pdf is being attached in one email 
           * where roles are all being cc'd togther. If each recipient got their own email separately, a 
           * role-specific pdf form could be generated for each.
           */
          // loginHref: getLoginHref(role), 
          meetsPrequisite: registrationFormEmailPrerequisitesAreMet
        });
        break;
    }
    if(isOk(response)) {
      sent = true;
    }  
  }
  catch(e:any) {
    error(e);
  }
  if( ! sent) {
    log(_email, `Proceeding with cognito account setup, but failed to send registration email.`);
  }
}

/**
 * A login url is built from the cloudfront domain and a path, both of which are found as environment variables.
 * The path environment variable is named after the role of the user plus "_PATH".
 * 
 * TODO: There is currently no way to know if the user/consenter was using the bootstrap app or the 
 * standard website. So, the loginHref is currently assumed to be the standard website, and the path for the
 * url nested in any pdf generated for sending out registration forms will NOT refer to a bootstrap endpoint
 * (even if the bootstrap app was used for registration). Is this limitation worth addressing?
 * 
 * WORKAROUND?: Since cognito does not provide a mechanism for passing custom state with the post signup event 
 * objects, the solution would have to have the registration forms sent by the front end via a separate api 
 * call after the post signup callback redirect. The signup call to cognito would include the information as
 * as post-signup redirect querystring details. This, however, might be too convoluted as it would require 
 * extending the predefined callback urls for the userpool client(s) to include more entries, and more frontend
 * code to check for evidence of the custom querystring parameters signalling an api call to send forms is
 * needed. Too much complexity for a simple task - just do it here and for now, or until a 3rd alternative 
 * presents itself.
 * 
 * @param role 
 * @returns 
 */
export const getLoginHref = (role?:Role):string => {
  const { CLOUDFRONT_DOMAIN:domain } = process.env;
  const url = new URL(`https://${domain}`);
  if(role) {
    const pathname = process.env[`${role}_PATH`];
    url.pathname = pathname!;
  }
  return url.href;
}

export const getTermsHref = ():string => {
  const { CLOUDFRONT_DOMAIN:domain } = process.env;
  const pathname = process.env.TERMS_OF_USE_PATH;
  const url = new URL(`https://${domain}`);
  url.pathname = pathname!;
  return url.href;
}

/**
 * Registration forms should only be sent out if userInfo indicates an active RE_ADMIN and 2 active RE_AUTH_INDs
 * @param userInfo 
 * @returns 
 */
export const registrationFormEmailPrerequisitesAreMet = (userInfo:UserInfo):boolean => {
  const { role, active, entity: { users } } = userInfo;

  // Tally up the number of active RE_ADMINs
  let reAdmins = 0;
  if(role == Roles.RE_ADMIN && active == YN.Yes) {
    reAdmins++;
  }
  let lookupResults = users.filter(u => u.role == Roles.RE_ADMIN && u.active == YN.Yes);
  reAdmins += lookupResults.length;

  // Tally up the number of active RE_AUTH_INDs
  let reAuthInds = 0;
  if(role == Roles.RE_AUTH_IND && active == YN.Yes) {
    reAuthInds++;
  }
  lookupResults = users.filter(u => u.role == Roles.RE_AUTH_IND && u.active == YN.Yes);
  reAuthInds += lookupResults.length;

  const met = (reAdmins == 1 && reAuthInds == 2)
  log({ reAdmins, reAuthInds }, `Registration form email prerequisites are ${met ? 'met' : 'NOT met'}`);

  return met;
}


/**
 * RUN MANUALLY:
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/cognito/PostSignup.ts')) {

  const task = 'handler' as 'handler' | 'scrape';

  (async () => {
    switch(task) {

      case 'handler':

        // Create a reduced app config just for this test
        const { AUTH_IND_NBR } = ConfigNames;
        const configs = { useDatabase:false, configs: [
          { name: AUTH_IND_NBR, value: '2', config_type: ConfigTypes.NUMBER, description: 'testing' },
        ]} as CONFIG;
        
        // Set the config as an environment variable
        const context:IContext = await require('../../../../contexts/context.json');
        process.env[Configurations.ENV_VAR_NAME] = JSON.stringify(configs);
        const { CONSENTING_PERSON_PATH, RE_ADMIN_PATH, RE_AUTH_IND_PATH } = context;
        process.env.CONSENTING_PERSON_PATH = CONSENTING_PERSON_PATH;
        process.env.RE_ADMIN_PATH = RE_ADMIN_PATH;
        process.env.RE_AUTH_IND_PATH = RE_AUTH_IND_PATH;

        const mockEvent = {
          "version": "1",
          "region": "us-east-2",
          "userPoolId": "us-east-2_sOpeEXuYJ",
          "userName": "812be5f0-7061-70a0-1deb-6de1a938431d",
          "callerContext": {
              "awsSdkVersion": "aws-sdk-unknown-unknown",
              "clientId": "5me7av3klctvios49o3cr6ap1h"
          },
          "triggerSource": "PostConfirmation_ConfirmSignUp",
          "request": {
              "userAttributes": {
                  "sub": "812be5f0-7061-70a0-1deb-6de1a938431d",
                  "email_verified": "true",
                  "cognito:user_status": "CONFIRMED",
                  "phone_number_verified": "false",
                  "phone_number": "+1234567890",
                  "email": "auth3.random.edu@warhen.work"
              }
          },
          "response": {}
        }

        await handler(mockEvent);

        break;

      case 'scrape':
        const invitation = await scrapeUserValuesFromInvitations(
          ():Promise<Invitation[]> => new Promise((resolve) => resolve([{
            code: "6dce2b00-b76e-48d1-85aa-4cbf3b249d4e",
            email: "asp2.random.edu@warhen.work",
            entity_id: "fe2e9f55-408f-472e-8ea7-65dc1f896390",
            entity_name: undefined,
            fullname: "Abraham Lincoln",
            message_id: "010f019355356592-9bd26186-1e5d-4a96-94c8-180e221d0418-000000",
            registered_timestamp: "2024-11-22T18:51:02.119Z",
            role: Roles.RE_ADMIN,
            sent_timestamp: "2024-11-22T18:49:43.131Z",          
          } as Invitation] as Invitation[])),
          'asp2.random.edu@warhen.work',
          Roles.RE_ADMIN
        );

        log(invitation, 'Scraped Invitation');
        break;
    }
  })();

}
