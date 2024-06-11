import { DAOFactory, DAOInvitation } from "../../_lib/dao/dao";
import { Invitation, Role, Roles } from "../../_lib/dao/entity";
import { PreSignupEventType } from "./PreSignupEventType";
import { lookupRole, lookupUserPoolClientId, lookupUserPoolId } from "../../_lib/cognito/Lookup";
import { DynamoDbConstruct } from "../../../DynamoDb";

export enum Messages {
  UNINVITED = 'You are not on the invite list for signup as ',
  SERVER_ERROR = 'Server error during initial pre-screening process at ',
  ROLE_LOOKUP_FAILURE = 'Cannot determine role',
  RETRACTED = 'Your invitation was retracted signup as '
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

    // All invitations associated with the email.
    let qualifiedInvitations = await dao.read() as Invitation[];

    // Check for illegal state.
    const illegalStateInvitations = qualifiedInvitations.filter((invitation) => {
      if( ! invitation.acknowledged_timestamp || ! invitation.registered_timestamp) {
        console.error(
          `INVALID STATE: an invitation has persisted its email address (${email}) BEFORE the legal 
          requirements for doing so have been met! Check the codebase for bugs or flaws that would 
          allow this to happen. The email field of an invitation should be set to the invitation code 
          and NEVER the actual value before the user has acknowledged and registered as part of their 
          registration.`);
      }
    });

    // Reduce down to invitations for the same role.
    qualifiedInvitations = qualifiedInvitations.filter((invitation) => { 
      return invitation.role == role; 
    });

    // All invitations for the same role that have been retracted.
    const retractedInvitations = [] as Invitation[];

    // Reduce down to invitations that have not been retracted.
    qualifiedInvitations = qualifiedInvitations.filter((invitation) => { 
      if(invitation.retracted_timestamp) {
        retractedInvitations.push(invitation);
        return false;
      }
      return true;
    });
    
    switch(qualifiedInvitations.length) {
      case 0:
        if(retractedInvitations.length > 0) {
          throw new Error(Messages.RETRACTED + role);
        }
        throw new Error(Messages.UNINVITED + role);
      default:
        return event;
    }

  }
  catch(e) {
    console.error(e);
    throw e;
  }
}

/**
 * RUN MANUALLY: Modify the role, region, etc. as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_COGNITO_PRE_SIGNUP') {

  const role:Role = Roles.SYS_ADMIN;
  const userpoolName:string = 'ett-cognito-userpool';
  const region = 'us-east-2';
  const email = 'wrh@bu.edu';
  let userPoolId:string|undefined;

  process.env.DYNAMODB_INVITATION_TABLE_NAME = DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME;
  process.env.DYNAMODB_USER_TABLE_NAME = DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME;
  process.env.DYNAMODB_ENTITY_TABLE_NAME = DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME;
  process.env.DYNAMODB_INVITATION_EMAIL_INDEX = DynamoDbConstruct.DYNAMODB_INVITATION_EMAIL_INDEX;
  process.env.DYNAMODB_INVITATION_ENTITY_INDEX = DynamoDbConstruct.DYNAMODB_INVITATION_ENTITY_INDEX;

  lookupUserPoolId(userpoolName, region)
  .then((id:string|undefined) => {
    userPoolId = id;
    return lookupUserPoolClientId(userPoolId||'', role, region);
  })
  .then((clientId:string|undefined) => {
    const _event = {
      region, userPoolId,
      callerContext: { clientId },
      request: {
        userAttributes: { email }
      }
    } as PreSignupEventType;

    return handler(_event);
  })
  .then(() => {
    console.log('Presignup check complete.');
  }).catch((reason) => {
    console.error(reason);
  });
}