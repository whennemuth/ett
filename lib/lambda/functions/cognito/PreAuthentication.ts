import { Role, User, UserFields, YN } from "../../_lib/dao/entity";
import { DAOUser, DAOFactory } from '../../_lib/dao/dao';
import { PreAuthenticationEventType } from "./PreAuthenticationEventType";
import { lookupRole } from './RoleLookup';

export enum Messages {
  ACCOUNT_UNCONFIRMED = 'Your account has not attained confirmation status',
  EMAIL_UNVERIFIED = 'Signup completion for your account is pending email verification',
  ROLE_LOOKUP_FAILURE = 'Cannot determine role',
  EMAIL_LOOKUP_FAILURE = 'Error recovering your email address',
  ACCOUNT_DEACTIVATED = 'Your role in this account has been deactivated',
  UNAUTHORIZED = 'You do not have the role of ',
  SERVER_ERROR = 'Server error during post-signup process at ',
}

const debugLog = (entry:String) => { 
  if(process.env?.DEBUG === 'true') {
    console.log(entry);
  }
};

/**
 * Intercept all login attempts and turn away any that indicate the user is using a userpool client that
 * corresponds to a role they do not have. For example a CONSENTING_PERSON cannot sign in as a GATEKEEPER.
 * @param event 
 * @returns 
 */
export const handler = async (_event:any) => {
  try {
    debugLog(JSON.stringify(_event, null, 2));

    const event = _event as PreAuthenticationEventType;
    const { userPoolId, region } = event;
    let role:Role|undefined;
    if( event?.callerContext) {
      const { clientId } = event?.callerContext;

      // Determined what role applies for the user who is trying to login, based on the userpool client used.
      role = await lookupRole(userPoolId, clientId, region);

      if( ! role) {
        throw new Error(Messages.ROLE_LOOKUP_FAILURE);
      }

      const { email, email_verified, 'cognito:user_status':status } = event?.request?.userAttributes;

      if(status != 'CONFIRMED') {
        throw new Error(Messages.ACCOUNT_UNCONFIRMED);
      }

      if((email_verified + '') != 'true') {
        throw new Error(Messages.EMAIL_UNVERIFIED);
      }

      if( ! email) {
        throw new Error(Messages.EMAIL_LOOKUP_FAILURE);
      }

      const dao:DAOUser = DAOFactory.getInstance({ DAOType: "user", Payload: {
        [UserFields.email]: email,
        [UserFields.role]: role
      }}) as DAOUser;

      const entries:User[] = await dao.read() as User[];
      let matchingUser:User|null = null;
      for(const user of entries) {
        if(user.role == role) {
          matchingUser = user;
          break;
        }
      }

      if(matchingUser && matchingUser.active == YN.No) {
        throw new Error(Messages.ACCOUNT_DEACTIVATED.replace('role', `${role} role`));
      }

      if(matchingUser) {
        return event;
      } 
    }

    throw new Error(Messages.UNAUTHORIZED + role);
  }
  catch(e) {
    const errTime = new Date().toISOString();
    console.log(`Error at: ${errTime}`);
    console.error(e);
    throw new Error(Messages.SERVER_ERROR + errTime);
  }
}
