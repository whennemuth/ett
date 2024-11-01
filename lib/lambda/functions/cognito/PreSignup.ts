import { IContext } from "../../../../contexts/IContext";
import { lookupRole, lookupUserPoolClientId, lookupUserPoolId } from "../../_lib/cognito/Lookup";
import { DAOFactory, DAOInvitation } from "../../_lib/dao/dao";
import { ConsenterCrud } from "../../_lib/dao/dao-consenter";
import { Consenter, Invitation, Role, Roles, Validator } from "../../_lib/dao/entity";
import { debugLog } from "../../Utils";
import { PreSignupEventType } from "./PreSignupEventType";

export enum Messages {
  UNINVITED = 'You are not on the invite list for signup as ',
  SERVER_ERROR = 'Server error during initial pre-screening process at ',
  ROLE_LOOKUP_FAILURE = 'Cannot determine role',
  ROLE_MISSING = 'PreSignUp_AdminCreateUser did not send role information in event.request.clientMetadata',
  RETRACTED = 'Your invitation was retracted signup as '
}

/**
 * Intercept all signup attempts early, before they reach the confirmation stage, and lookup the email in the
 * invitations dynamodb table. If no table entries are found, error out - this will cancel the signup for the 
 * user with a message in the hosted UI taken from the error.
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
    debugLog(_event); 

    const event = _event;
    const { userPoolId, region } = event;
    const { clientId } = event?.callerContext;
    let role:Role|undefined;

    // Get the role for the user who is signing up.
    let { role:sRole } = event?.request?.clientMetadata ?? {};
    let adminCreateUser:boolean = false;
    if(Validator().isRole(sRole)) {
      // clientId is 'CLIENT_ID_NOT_APPLICABLE' and event.triggerSource = 'PreSignUp_AdminCreateUser'
      role = `${sRole.toUpperCase()}` as Role;
      if( ! role) throw new Error(Messages.ROLE_MISSING);
      adminCreateUser = true;
    }
    else {
      // Determine what role applies to the "doorway" (userpool client) the user is entering through for signup
      role = await lookupRole(userPoolId, clientId, region);
      if( ! role) throw new Error(Messages.ROLE_LOOKUP_FAILURE);
    }
    
    const { email } = event?.request?.userAttributes;

    if(role == Roles.CONSENTING_PERSON && adminCreateUser) {
      // Consenting persons do not need to be invited to signup and do not need to exist in the
      // database yet if adminCreateUser is indicated, so exit here.
      return event;
    }
    
    if(role == Roles.CONSENTING_PERSON) {
      // Lookup the consenter in the database to ensure they already exist.
      let dao = ConsenterCrud({ email } as Consenter);
      console.log(`Checking ${email} already exists as a consenter in the database`);
      let consenter = await dao.read();
      if( ! consenter) {
        throw new Error(`Error: ${email} does not exist`);
      }

      // Consenting persons do not need to be invited to signup, so exit here.
      return event;
    }

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
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/cognito/PreSignup.ts')) {

  const role:Role = Roles.SYS_ADMIN;

  (async () => {
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, REGION, TAGS: { Landscape } } = context;
    const userpoolName:string = `${STACK_ID}-${Landscape}-cognito-userpool`;
    const userPoolId = await lookupUserPoolId(userpoolName, REGION);
    if( ! userPoolId) throw new Error(`No such userpool: ${userpoolName}`);
    const clientId = await lookupUserPoolClientId(userPoolId, role, REGION);
    const email = 'wrh@bu.edu';

    const _event = {
      region:REGION, userPoolId,
      callerContext: { clientId },
      request: {
        userAttributes: { email }
      }
    } as PreSignupEventType;

    await handler(_event);

    console.log('Presignup check complete.');
  })();
}