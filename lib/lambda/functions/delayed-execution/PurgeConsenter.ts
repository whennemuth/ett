import * as ctx from '../../../../contexts/context.json';
import { IContext } from "../../../../contexts/IContext";
import { DelayedExecutions } from "../../../DelayedExecution";
import { UserAccount } from "../../_lib/cognito/UserAccount";
import { Configurations } from "../../_lib/config/Config";
import { ConsenterCrud } from "../../_lib/dao/dao-consenter";
import { ConfigNames, Consenter, Roles } from "../../_lib/dao/entity";
import { EmailParms, sendEmail } from "../../_lib/EmailWithAttachments";
import { DelayedLambdaExecution, PostExecution, ScheduledLambdaInput } from "../../_lib/timer/DelayedExecution";
import { humanReadableFromSeconds } from "../../_lib/timer/DurationConverter";
import { EggTimer, PeriodType } from "../../_lib/timer/EggTimer";
import { debugLog, log } from "../../Utils";
import { isActiveConsent } from "../consenting-person/ConsentingPerson";

export const RulePrefix = 'Consenter purge';

/**
 * After a consenter has registered and the first data related to them has been stored in the database,
 * this lambda will be triggered to remove the consenter record from the database and any presence in 
 * the user pool if a configured amount of time has gone by without the user having submitted a consent form.
 * @param event 
 * @param context 
 */
export const handler = async (event:ScheduledLambdaInput, context:any) => {
  const { lambdaInput, eventBridgeRuleName, targetId } = event;
  try {
    debugLog({ event, context });

    const { consenterEmail } = lambdaInput ?? {};

    log({ consenterEmail }, `Running consenter purge check`);

    // Lookup consenter database record
    const dao = ConsenterCrud({ email: consenterEmail } as Consenter);
    const consenter = await dao.read() as Consenter;

    if( ! consenter) {
      log(`Consenter ${consenterEmail} not found in database`);
      return;
    }

    if(isActiveConsent(consenter)) {
      log(`Consenter ${consenterEmail} has active consent, skipping purge`);
      return;
    }

    const { sub } = consenter;

    log(`Deleting consenter ${consenterEmail} from database`);
    await dao.Delete();

    if(sub) {
      const emailProp = { email: { propname:'email', value:consenterEmail } };
      const userAccount = await UserAccount.getInstance(emailProp, Roles.CONSENTING_PERSON);
      const accountDetails = await userAccount.read();
      if(accountDetails) {
        log({ consenterEmail, sub}, 'Deleting from user pool');
        await userAccount.Delete();
      }
    }

    const configs = new Configurations();
    const { DELETE_CONSENTER_AFTER } = ConfigNames;
    const periodSeconds = parseInt((await configs.getAppConfig(DELETE_CONSENTER_AFTER)).value);
    const _context:IContext = <IContext>ctx;

    // Notify the consenter that their account has been purged.
    sendEmail({ 
      subject: 'ETT consent expiration notification', 
      from: `noreply@${_context.ETT_DOMAIN}`, 
      message: `This email is notification that your ${humanReadableFromSeconds(periodSeconds)} window of ` + 
        `time for providing consent has expired. To resume with ETT, repeat you initial account signup and registration.`,
      to: [ consenterEmail ] 
    } as EmailParms);
  }
  catch(e:any) {
    log(e);
  }
  finally {
    await PostExecution().cleanup(eventBridgeRuleName, targetId);
  }
}



/**
 * RUN MANUALLY
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/delayed-execution/PurgeConsenter.ts')) {

  const task = 'immediate' as 'immediate'|'scheduled';
  const { MINUTES } = PeriodType;

  (async () => {
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, REGION, ACCOUNT, TAGS: { Landscape }} = context;
    const prefix = `${STACK_ID}-${Landscape}`;
    process.env.PREFIX = prefix;
    process.env.REGION = REGION;

    const createDelayedExecutionToRemoveConsenter = async (lambdaInput:any, callback:Function) => {
      const functionName = `${prefix}-${DelayedExecutions.ConsenterPurge.coreName}`;
      const lambdaArn = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${functionName}`;
      await callback(lambdaArn, lambdaInput);
    }

    const lambdaInput = { consenterEmail:'cp2@warhen.work'}

    let callback;    
    switch(task) {
      case "immediate":
        callback = async (lambdaArn:string, lambdaInput:any) => {
          await handler({ lambdaInput } as ScheduledLambdaInput, null);
        };
        await createDelayedExecutionToRemoveConsenter(lambdaInput, callback);
        break;
      case "scheduled":
        callback = async (lambdaArn:string, lambdaInput:any) => {
          const delayedTestExecution = new DelayedLambdaExecution(lambdaArn, lambdaInput);
          const timer = EggTimer.getInstanceSetFor(2, MINUTES); 
          await delayedTestExecution.startCountdown(timer, `${RulePrefix} (TESTING)`);
        };
        await createDelayedExecutionToRemoveConsenter(lambdaInput, callback);
        break;
    }

  })();
}
