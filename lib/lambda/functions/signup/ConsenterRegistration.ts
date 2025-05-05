import { DelayedExecutions } from "../../../DelayedExecution";
import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { Configurations } from "../../_lib/config/Config";
import { ConsenterCrud } from "../../_lib/dao/dao-consenter";
import { ConfigNames, Consenter, YN } from "../../_lib/dao/entity";
import { DelayedLambdaExecution } from "../../_lib/timer/DelayedExecution";
import { EggTimer, PeriodType } from "../../_lib/timer/EggTimer";
import { debugLog, error, errorResponse, invalidResponse, log, okResponse, warn } from "../../Utils";
import { ConsentStatus, consentStatus } from "../consenting-person/ConsentStatus";
import { ID as scheduleTypeId, Description as scheduleDescription } from "../delayed-execution/PurgeConsenter";

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

    const { 
      email, 
      firstname: _firstname, 
      middlename: _middlename, 
      lastname: _lastname, 
      phone_number: _phone_number,
      registration_signature,
    } = parameters;

    if( ! email) {
      return invalidResponse('Bad Request: Missing email parameter');
    }

    if( ! _firstname) {
      return invalidResponse('Bad Request: Missing firstname parameter');
    }

    if( ! _lastname) {
      return invalidResponse('Bad Request: Missing lastname parameter');
    }

    if( ! registration_signature) {
      warn(`Missing registration_signature parameter for ${email}.`);
    }

    log(`Registering ${email}`);

    const create_timestamp = new Date().toISOString();

    // Set as inactive pending submission of consent form.
    const active = YN.No

    // Lookup the consenter (regardless of active status) in case registration was interrupted and is being retried
    let dao = ConsenterCrud({ consenterInfo: { email } as Consenter });
    let existingConsenter = await dao.read() as (Consenter|null)|Consenter[];
    if(Array.isArray(existingConsenter)) {
      existingConsenter = existingConsenter[0];
    }

    // Carry over any changes made during the registration process to the existing consenter record for updates below.
    dao = ConsenterCrud({ 
      consenterInfo: { 
        email, firstname: _firstname, middlename: _middlename, lastname: _lastname, 
        create_timestamp, registration_signature, active 
      } as Consenter, removeEmptyMiddleName: true
    });

    if(existingConsenter) {
      const { sub } = existingConsenter;
      const { ACTIVE, EXPIRED, FORTHCOMING, RESCINDED } = ConsentStatus;
      const status = await consentStatus(existingConsenter);

      if(sub && (status == ACTIVE || status == FORTHCOMING)) {
        log(`Consenter ${email} has a cognito userpool account and is NOT rescinded, so is already registered.`);
        return invalidResponse(`Cannot sign up ${email} - this account is already registered with ETT. Please login instead.`);
      }

      if(status == RESCINDED) {
        log(`Consenter ${email} has rescinded consent, but is re-registering.`);
      }
      
      if(status == EXPIRED) {
        log(`Consenter ${email} consent has expired, but they are re-registering.`);
      }
      
      if(sub) {
        log(`Consenter ${email} already exists in database and has a cognito account, updating...`);
      }
      else {
        log(`Consenter ${email} already exists in database (no cognito account yet), updating...`);
      }

      // Update the consenter record
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
  const description = `${scheduleDescription} (${consenterEmail})`;
  if(functionArn) {
    const configs = new Configurations();
    const waitTime = (await configs.getAppConfig(ConfigNames.DELETE_CONSENTER_AFTER)).getDuration();
    const lambdaInput = { consenterEmail };
    const delayedTestExecution = new DelayedLambdaExecution(functionArn, lambdaInput);
    const { SECONDS } = PeriodType;
    const timer = EggTimer.getInstanceSetFor(waitTime, SECONDS); 
    await delayedTestExecution.startCountdown(timer, scheduleTypeId, description);
  }
  else {
    console.error(`Cannot schedule ${description}: ${envVarName} variable is missing from the environment!`);
  }

}
