import { DelayedExecutions } from "../../../DelayedExecution";
import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { Configurations } from "../../_lib/config/Config";
import { ConsenterCrud } from "../../_lib/dao/dao-consenter";
import { ConfigNames, Consenter, YN } from "../../_lib/dao/entity";
import { DelayedLambdaExecution } from "../../_lib/timer/DelayedExecution";
import { EggTimer, PeriodType } from "../../_lib/timer/EggTimer";
import { debugLog, error, errorResponse, invalidResponse, log, okResponse } from "../../Utils";
import { RulePrefix as PcRulePrefix } from "../delayed-execution/targets/PurgeConsenter";

/**
 * Handles the public steps of registration for consenting individual
 * @param event 
 * @returns 
 */
export const handler = async(event:any):Promise<LambdaProxyIntegrationResponse> => {

  try {
    debugLog(event);
    
    const payloadJson = event.headers[AbstractRoleApi.ETTPayloadHeader];
    const payload = payloadJson ? JSON.parse(payloadJson) as IncomingPayload : null;
    const { parameters } = payload ?? {};
    
    if( ! parameters) {
      return invalidResponse(`Bad Request: Missing parameters parameter for consenter registration`);
    }

    const { email, firstname, middlename, lastname } = parameters;

    if( ! email) {
      return invalidResponse('Bad Request: Missing email parameter');
    }

    if( ! firstname) {
      return invalidResponse('Bad Request: Missing firstname parameter');
    }

    if( ! lastname) {
      return invalidResponse('Bad Request: Missing lastname parameter');
    }

    log(`Registering ${email}`);

    const create_timestamp = new Date().toISOString();
    // Set as inactive pending submission of consent form.
    const active = YN.No

    // Lookup the consenter in case registration was interrupted and is being retried
    let dao = ConsenterCrud({ consenterInfo: { 
      email, firstname, middlename, lastname, create_timestamp, active } as Consenter 
    });
    const existingConsenter = await dao.read() as Consenter;

    if(existingConsenter) {
      const { sub } = existingConsenter;
      if(sub) {
        // If the consenter record has a cognito sub, then they have already signed up and been established as a user in the userpool.
        return invalidResponse(`Cannot sign up ${email} - this account already exists with ETT. Please login instead.`);
      }
      console.log(`Consenter ${email} already exists in database (no cognito account yet), updating...`);
      await dao.update(existingConsenter);
    }
    else {
      await dao.create();

      await sheduleConsenterPurge(email);
    }
  
    return okResponse(`${email} registered`);
  }
  catch(e:any) {
    error(e);
    return errorResponse(e.message);
  }
}

export const sheduleConsenterPurge = async (consenterEmail:string) => {
  const envVarName = DelayedExecutions.ConsenterPurge.targetArnEnvVarName;
  const functionArn = process.env[envVarName];
  const description = `${PcRulePrefix} (${consenterEmail})`;
  if(functionArn) {
    const configs = new Configurations();
    const waitTime = (await configs.getAppConfig(ConfigNames.DELETE_CONSENTER_AFTER)).getDuration();
    const lambdaInput = { consenterEmail };
    const delayedTestExecution = new DelayedLambdaExecution(functionArn, lambdaInput);
    const { SECONDS } = PeriodType;
    const timer = EggTimer.getInstanceSetFor(waitTime, SECONDS); 
    await delayedTestExecution.startCountdown(timer, description);
  }
  else {
    console.error(`Cannot schedule ${description}: ${envVarName} variable is missing from the environment!`);
  }

}
