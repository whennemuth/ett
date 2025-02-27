import * as ctx from '../../../../contexts/context.json';
import { IContext } from "../../../../contexts/IContext";
import { DelayedExecutions } from "../../../DelayedExecution";
import { Configurations } from '../../_lib/config/Config';
import { InvitationCrud } from "../../_lib/dao/dao-invitation";
import { ConfigNames, Invitation, Roles } from "../../_lib/dao/entity";
import { EmailParms, sendEmail } from '../../_lib/EmailWithAttachments';
import { DelayedLambdaExecution, PostExecution, ScheduledLambdaInput } from "../../_lib/timer/DelayedExecution";
import { EggTimer, PeriodType } from "../../_lib/timer/EggTimer";
import { debugLog, log } from "../../Utils";

export type StaleInvitationLambdaParms = {
  invitationCode:string, email:string
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

    const { role } = invitation;

    // At this point, the invitation is "anonymous" and will not have the email address, so set it.
    invitation.email = email;

    // For a RE_AUTH_IND, bail out if the stale entity vacancy handler is yet to run (let it handle invitation removal).
    if(role == Roles.RE_AUTH_IND) {
      const configs = new Configurations();
      const { AUTH_IND_INVITATION_EXPIRE_AFTER:_staleInvitation, STALE_AI_VACANCY:_staleVacancy } = ConfigNames;
      const staleInvitation = parseInt((await configs.getAppConfig(_staleInvitation)).value);
      const staleVacancy = parseInt((await configs.getAppConfig(_staleVacancy)).value);
      if(staleVacancy >= staleInvitation) {
        log(invitation, 'This stale invitation handler is configured to run at the same time ' + 
          'as or BEFORE the stale entity vacancy handler. Therefore deferring deletion of invitation ' +
          'to stale entity vacancy handler');
        return;
      }
    }
    
    log(invitation, 'Deleting stale invitation from database');

    await dao.Delete();

    await sendEndOfRegistrationEmail({ invitation });
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
    message = message ?? 'This email is notification that your invitation to register in the Ethical ' +
      'Training Tool (ETT) has expired and the registration period has ended.';
    subject = subject ?? 'ETT end of registration Notification';

    switch(role) {
      case RE_ADMIN:
        message = message.replace('(ETT)', '(ETT) as Administrative Support Professional');
        break;
      case RE_AUTH_IND:
        message = message.replace('(ETT)', 'Authorized Individual');
        break;
      case SYS_ADMIN:
        message = 'This email is notification that your invitation to register in the Ethical (ETT) has expired';
        subject = 'ETT invitation expiration Notification';
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

  const task = 'scheduled' as 'immediate'|'scheduled';
  const { MINUTES } = PeriodType;

  (async () => {
    const context:IContext = await require('../../../../contexts/context.json');
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
      invitationCode:'320a96db-f316-4ce8-b27d-28f8589b711d', 
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
