import * as ctx from '../../../../../contexts/context.json';
import { IContext } from "../../../../../contexts/IContext";
import { DelayedExecutions } from "../../../../DelayedExecution";
import { InvitationCrud } from "../../../_lib/dao/dao-invitation";
import { Invitation, roleFullName, Roles } from "../../../_lib/dao/entity";
import { EmailParms, sendEmail } from '../../../_lib/EmailWithAttachments';
import { DelayedLambdaExecution, PostExecution, ScheduledLambdaInput } from "../../../_lib/timer/DelayedExecution";
import { EggTimer, PeriodType } from "../../../_lib/timer/EggTimer";
import { debugLog, log } from "../../../Utils";

export type StaleInvitationLambdaParms = {
  invitationCode:string, email:string, entity_id?:string
}

export const RulePrefix = 'Remove stale invitations';

/**
 * After an invitation has been sent to a user, this lambda will be triggered to remove the invitation
 * from the database if it has not been used to register by the time the trigger is set to fire.
 * @param event 
 * @param context 
 */
export const handler = async (event:ScheduledLambdaInput, context:any) => {
  const { lambdaInput, eventBridgeRuleName, targetId } = event;
  try {
    debugLog({ event, context });

    const { invitationCode, email } = (lambdaInput ?? {}) as StaleInvitationLambdaParms;

    log(lambdaInput, `Running stale invitation check`);

    // Lookup invitation database record
    const dao = InvitationCrud({ code: invitationCode } as Invitation);
    const invitation = await dao.read() as Invitation;

    // If invitation is not found, log and return
    if( ! invitation) {
      log(`Invitation ${invitationCode} to ${email} not found in database`);
      return;
    }

    let invitationWasUsedToRegister = true;
    if(invitation.email != email) {
      // At this point, the invitation is "anonymous", but set email temporarily as if it were not.
      invitation.email = email;
      invitationWasUsedToRegister = false;
    }    
    
    log(invitation, 'Deleting stale invitation from database');

    await dao.Delete();

    // Inform the user via email that their invitation has expired if they have not used that invitation yet.
    if( ! invitationWasUsedToRegister) {
      await sendEndOfRegistrationEmail({ invitation });
    }
  }
  catch(e:any) {
    log(e);
  }
  finally {
    await PostExecution().cleanup(eventBridgeRuleName, targetId);
  }
}

export type EndOfRegistrationEmailParms = {
  invitation:Invitation,
  message?:string,
  subject?:string
}
export const sendEndOfRegistrationEmail = async (parms:EndOfRegistrationEmailParms):Promise<boolean> => {
  let { invitation: { email, role }, message, subject } = parms;
  const { RE_ADMIN, RE_AUTH_IND, SYS_ADMIN } = Roles;
  const context:IContext = <IContext>ctx;

  log(parms, 'Notifying user of stale invitation and end of registration period');

  try {
    subject = subject ?? 'ETT Invitation Expiration Notification';
    message = message ?? 'This email is notification that your invitation to register in the Ethical ' +
      `Training Tool (ETT) as an ${roleFullName(role)} has expired`

    switch(role) {
      case RE_ADMIN: case RE_AUTH_IND:
        message = message + ', and the registration period is now ended.'
        break;
      case SYS_ADMIN:
        message = message + '.';
        break;
    }

    return sendEmail({ subject, from: `noreply@${context.ETT_DOMAIN}`, message, to: [ email ] } as EmailParms);  
  }
  catch(e) {
    log(e);
    return false;
  }
}



/**
 * RUN MANUALLY
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/delayed-execution/RemoveStaleInvitations.ts')) {

  const task = 'immediate' as 'immediate'|'scheduled';
  const { MINUTES } = PeriodType;

  (async () => {
    const context:IContext = await require('../../../../../contexts/context.json');
    const { STACK_ID, REGION, ACCOUNT, TAGS: { Landscape }} = context;
    const prefix = `${STACK_ID}-${Landscape}`;
    process.env.PREFIX = prefix;
    process.env.REGION = REGION;

    const createDelayedExecutionToRemoveStaleInvitation = async (lambdaInput:any, callback:Function) => {
      const functionName = `${prefix}-${DelayedExecutions.RemoveStaleInvitations.coreName}`;
      const lambdaArn = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${functionName}`;
      await callback(lambdaArn, lambdaInput);
    }

    const lambdaInput = { 
      invitationCode:'fb8d324e-cb2a-47a0-a7ed-5e59589d9929', 
      email:'asp2.random.edu@warhen.work' 
    } as StaleInvitationLambdaParms;

    let callback;    
    switch(task) {
      case "immediate":
        callback = async (lambdaArn:string, lambdaInput:any) => {
          await handler({ lambdaInput } as ScheduledLambdaInput, null);
        };
        await createDelayedExecutionToRemoveStaleInvitation(lambdaInput, callback);
        break;
      case "scheduled":
        callback = async (lambdaArn:string, lambdaInput:any) => {
          const delayedTestExecution = new DelayedLambdaExecution(lambdaArn, lambdaInput);
          const timer = EggTimer.getInstanceSetFor(2, MINUTES); 
          await delayedTestExecution.startCountdown(timer, `${RulePrefix} (TESTING)`);
        };
        await createDelayedExecutionToRemoveStaleInvitation(lambdaInput, callback);
        break;
    }

  })();
}
