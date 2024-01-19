import { DAOFactory, DAOInvitation } from "../../_lib/dao/dao";
import { UpdateOutput } from "../../_lib/dao/dao-invitation";
import { Invitation, Role, Roles } from "../../_lib/dao/entity";
import { PreSignupEventType } from "./PreSignupEventType";
import { lookupRole } from "./RoleLookup";

export enum Messages {
  UNINVITED = 'You are not on the invite list for signup as ',
  SERVER_ERROR = 'Server error during initial pre-screening process at ',
  ROLE_LOOKUP_FAILURE = 'Cannot determine role',
}

const debugLog = (entry:String) => { 
  if(process.env?.DEBUG === 'true') {
    console.log(entry);
  }
};

/**
 * Intercept all signup attempts early, before they reach the confirmation stage, and lookup the email in the
 * invitations dynamodb table. Mark any table entries that match the email and role with a timestamp for the
 * accepted_timestamp field - this will designate the invitation as accepted. If no table entries are found,
 * error out - this will cancel the signup for the user with a message in the hosted UI taken from the error.
 * 
 * NOTE: While it is technically possible for the dynamodb invitations table to contain multiple unaccepted
 * entries for the same email & role for different entities, the invite user api should prevent this state
 * by requiring an email recipient can only be invited to one entity at a time - that is, one must accept an 
 * inviation through the signup process for one entity before they can be invited to another entity. This 
 * does not apply to SYS_ADMINs as they are entity-agnostic. What this allows for is that it releases this
 * lambda function from having to "know" what entity is associated with the invitation for the email & role 
 * being accepted - information that cannot be passed in through the signup process - and making it safe to
 * accept ALL unaccepted invitation attempts because, if there is more than one, they should all be for the 
 * same entity and are probably just repeats.
 * @param _event 
 * @returns 
 */
export const handler = async (_event:any) => {
  try {
    debugLog(JSON.stringify(_event, null, 2)); 

    const event = _event as PreSignupEventType;
    const { userPoolId, region } = event;
    const { clientId } = event?.callerContext;

    // Determine what role applies to the "doorway" (userpool client) the user is entering through for signup
    const role:Role|undefined = await lookupRole(userPoolId, clientId, region);

    if( ! role){
      throw new Error(Messages.ROLE_LOOKUP_FAILURE);
    }

    if(role == Roles.CONSENTING_PERSON) {
      // Consenting persons do not need to be invited to signup
      return event;
    }

    const { email } = event?.request?.userAttributes;
    const dao = DAOFactory.getInstance({ DAOType: 'invitation', Payload: { email } }) as DAOInvitation;

    // All invitations for the email
    const knownInvitations = await dao.read() as Invitation[];

    // All invitations not accepted or retracted for the role in question
    const pendingInvitations = [] as Invitation[];

    // Load up the pendingInvitations array (Should usually just get one)
    knownInvitations.forEach((invitation) => {
      const pendingAttempts = invitation.attempts.filter((attempt) => {
        if(attempt.role != role) return false;
        if( ! attempt.retracted_timestamp) return false;
        if( ! attempt.accepted_timestamp) return false;
        return true;
      });
      if(pendingAttempts && pendingAttempts.length > 0) {
        pendingInvitations.push({
          email, entity_name: invitation.entity_name, attempts: pendingAttempts
        });
      }
    });
    
    if(pendingInvitations.length == 0) {
      throw new Error(Messages.UNINVITED + role);
    }
    else {
      // Mark all invitations to email for role to be accepted.
      const accepted_timestamp = new Date().toISOString();
      pendingInvitations.forEach(async (invitation) => {
        invitation.attempts.forEach((attempt) => {
          attempt.accepted_timestamp = accepted_timestamp;
        });
        const dao = DAOFactory.getInstance({ DAOType: 'invitation', Payload: invitation }) as DAOInvitation;
        const output:UpdateOutput = await dao.update();
        const updates = output.update.length;
        if(updates > 0) {
          console.log(`${updates} invitation to ${email} accepted for ${role}`);
        }
        else {
          console.error(`Dynamodb update to accept invitation to ${email} for ${role} indicates no items affected`);
        }
      });

      return event;
    }
  }
  catch(e) {
    const errTime = new Date().toISOString();
    console.log(`Error at: ${errTime}`);
    console.error(e);
    throw new Error(Messages.SERVER_ERROR + errTime);
  }
}
