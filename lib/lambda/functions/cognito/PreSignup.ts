import { IContext } from "../../../../contexts/IContext";
import { lookupRole, lookupUserPoolClientId, lookupUserPoolId } from "../../_lib/cognito/Lookup";
import { UserAccount } from "../../_lib/cognito/UserAccount";
import { Configurations } from "../../_lib/config/Config";
import { DAOFactory, DAOInvitation } from "../../_lib/dao/dao";
import { ConsenterCrud } from "../../_lib/dao/dao-consenter";
import { ConfigName, ConfigNames, Consenter, Invitation, Role, Roles, Validator } from "../../_lib/dao/entity";
import { debugLog, log } from "../../Utils";
import { PreSignupEventType } from "./PreSignupEventType";

export enum Messages {
  UNINVITED = 'You are not on the invite list for signup as ',
  SERVER_ERROR = 'Server error during initial pre-screening process at ',
  ROLE_LOOKUP_FAILURE = 'Cannot determine role',
  ROLE_MISSING = 'PreSignUp_AdminCreateUser did not send role information in event.request.clientMetadata',
  RETRACTED = 'Your invitation was retracted signup as ',
  EXPIRED = 'Your inviation has expired for '
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
    const { userPoolId, region, triggerSource, request } = event;
    const { clientId } = event?.callerContext;
    let role:Role|undefined;

    // Get the role for the user who is signing up.
    let { role:sRole } = request?.clientMetadata ?? {};
    let adminCreateUser:boolean = triggerSource == 'PreSignUp_AdminCreateUser';
    
    if(Validator().isRole(sRole)) {
      // clientId is 'CLIENT_ID_NOT_APPLICABLE' and event.triggerSource = 'PreSignUp_AdminCreateUser'
      role = `${sRole.toUpperCase()}` as Role;
      if( ! role) throw new Error(Messages.ROLE_MISSING);
    }
    else {
      // Determine what role applies to the "doorway" (userpool client) the user is entering through for signup
      role = await lookupRole(userPoolId, clientId, region);
      if( ! role) throw new Error(Messages.ROLE_LOOKUP_FAILURE);
    }
    
    const { email } = event?.request?.userAttributes;

    if(adminCreateUser) {
      // Anyone being created through AdminCreateUser will be an exception to requiring an invitation to signup.
      // So, end with success here to avoid the invitation checks below.
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
    }

    // Delete any pre-existing unverified account matches. The user will be issued a new verification email further down.
    const original = { email: { propname:'email', value:email } };
    const userAccount = await UserAccount.getInstance(original, Roles.SYS_ADMIN);
    const accountDetails = await userAccount.read();
    if(accountDetails) {
      if((await userAccount.isVerified(accountDetails)) == false) {
        log(`Detected a pre-existing account for ${email} that has not been verified. 
          This is probably a result of the user closing the cognito hosted UI verification screen 
          prematurely and re-trying their registration link later. Deleting the unverified account now ' 
          to clear the way for it being recreated (Otherwise cognito will return the user a message saying the email already exists).`);
        await userAccount.Delete();
      }
    }

    if(role == Roles.CONSENTING_PERSON) {
      // Consenting persons do not need to be invited to signup, so exit here.
      return event;
    }

    const dao = DAOFactory.getInstance({ DAOType: 'invitation', Payload: { email } }) as DAOInvitation;

    // All invitations associated with the email.
    let qualifiedInvitations = await dao.read() as Invitation[];

    // Check for illegal state.
    const illegalStateInvitations = qualifiedInvitations.filter((invitation) => {
      if( ! invitation.registered_timestamp) {
        console.error(
          `INVALID STATE: an invitation has persisted its email address (${email}) BEFORE the legal 
          requirements for doing so have been met! Check the codebase for bugs or flaws that would 
          allow this to happen. The email field of an invitation should be set to the invitation code 
          and NEVER the actual value before the user has carried out their signed registration`);
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
        if(role == Roles.RE_ADMIN || role == Roles.RE_AUTH_IND) {
          // Get invitation that was most recently sent for to the user that has not been retracted.
          const latestInvitation = qualifiedInvitations.reduce((prior:Invitation, current:Invitation) => {
            if(current.retracted_timestamp && ! prior.retracted_timestamp) return prior;
            if(prior.retracted_timestamp) return current;
            const priorSent = prior.sent_timestamp ? new Date(prior.sent_timestamp).getTime() : 0;
            const currentSent = current.sent_timestamp ? new Date(current.sent_timestamp).getTime() : 0;
            return currentSent > priorSent ? current : prior;
          }, qualifiedInvitations[0]);

          if(latestInvitation.retracted_timestamp) {
            throw new Error(Messages.RETRACTED + role);
          }

          // Determine if the latest invitation has already expired.
          const invited = new Date(latestInvitation.sent_timestamp);
          const configs = new Configurations();
          const { STALE_ASP_VACANCY, STALE_AI_VACANCY } = ConfigNames;
          const configName:ConfigName = role == Roles.RE_ADMIN ? STALE_ASP_VACANCY : STALE_AI_VACANCY;
          const staleAfterSeconds = (await configs.getAppConfig(configName)).getDuration();
          const staleAtTime = invited.getTime() + (staleAfterSeconds * 1000);
          if(staleAtTime <= Date.now()) {
            throw new Error(Messages.EXPIRED + role);
          }
        }
         
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

  const role:Role = Roles.CONSENTING_PERSON;

  (async () => {
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, REGION, TAGS: { Landscape } } = context;
    const userpoolName:string = `${STACK_ID}-${Landscape}-cognito-userpool`;
    const userPoolId = await lookupUserPoolId(userpoolName, REGION);
    if( ! userPoolId) throw new Error(`No such userpool: ${userpoolName}`);
    const clientId = await lookupUserPoolClientId(userPoolId, role, REGION);
    const email = 'cp1@warhen.work';

    const _event = {
      region:REGION, userPoolId,
      callerContext: { clientId },
      request: {
        userAttributes: { email }
      }
    } as PreSignupEventType;

  //   {
  //     "version": "1",
  //     "region": "us-east-2",
  //     "userPoolId": "us-east-2_sOpeEXuYJ",
  //     "userName": "f16b9570-8041-7012-dc6d-ca55cbee60e6",
  //     "callerContext": {
  //         "awsSdkVersion": "aws-sdk-unknown-unknown",
  //         "clientId": "53btiltned2e6b9etgg8oum7ok"
  //     },
  //     "triggerSource": "PreSignUp_SignUp",
  //     "request": {
  //         "userAttributes": {
  //             "phone_number": "+1234567890",
  //             "email": "cp1@warhen.work"
  //         },
  //         "validationData": null
  //     },
  //     "response": {
  //         "autoConfirmUser": false,
  //         "autoVerifyEmail": false,
  //         "autoVerifyPhone": false
  //     }
  // }

    await handler(_event);

    console.log('Presignup check complete.');
  })();
}