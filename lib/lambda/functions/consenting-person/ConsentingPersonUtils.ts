import * as ctx from '../../../../contexts/context.json';
import { IContext } from '../../../../contexts/IContext';
import { LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { DAOFactory } from "../../_lib/dao/dao";
import { ConsenterCrud } from "../../_lib/dao/dao-consenter";
import { ENTITY_WAITING_ROOM } from "../../_lib/dao/dao-entity";
import { ConfigNames, Consenter, ConsenterFields, Entity, ExhibitForm, YN } from "../../_lib/dao/entity";
import { PdfForm } from "../../_lib/pdf/PdfForm";
import { debugLog, errorResponse, invalidResponse, okResponse } from "../../Utils";
import { consentStatus, ConsentStatus } from "./ConsentStatus";
import { INVALID_RESPONSE_MESSAGES } from "./ConsentingPerson";
import { DelayedExecutions } from '../../../DelayedExecution';
import { Configurations } from '../../_lib/config/Config';
import { DelayedLambdaExecution } from '../../_lib/timer/DelayedExecution';
import { EggTimer, PeriodType } from '../../_lib/timer/EggTimer';
import { Description, ID } from "../delayed-execution/PurgeExhibitFormFromDatabase";
import { BucketInventory } from './BucketInventory';


export type ConsenterInfo = {
  consenter:Consenter, fullName:string, consentStatus:ConsentStatus, entities?:Entity[]
}

/**
 * Get a consenters database record and wrap it in extra computed data.
 * @param parm 
 * @returns 
 */
export const getConsenterInfo = async (parm:string|Consenter, includeEntityList:boolean=true): Promise<ConsenterInfo|null> => {
  let consenter;
  if(typeof parm == 'string') {
    const dao = DAOFactory.getInstance({ DAOType: 'consenter', Payload: { email:parm } as Consenter });
    consenter = await dao.read({ convertDates: false }) as Consenter;
  }
  else {
    consenter = parm as Consenter;
  }
  if( ! consenter) {
    return null;
  }
  let status = await consentStatus(consenter);
  let activeConsent = status == ConsentStatus.ACTIVE;
  if(consenter.active != YN.Yes) activeConsent = false;
  let entities:Entity[] = [];
  if(includeEntityList && activeConsent) {
    const entityDao = DAOFactory.getInstance({ DAOType: 'entity', Payload: { active:YN.Yes }});
    const _entities = await entityDao.read({ convertDates: false }) as Entity|Entity[];
    if(_entities instanceof Array) {
      entities.push(... (_entities as Entity[]).filter((_entity:Entity) => {
        return _entity.entity_id != ENTITY_WAITING_ROOM;
      }));
    }
    else {
      const entity = _entities as Entity;
      if(entity.entity_id  != ENTITY_WAITING_ROOM) {
        entities.push(entity);
      }
    }
  }
  const { firstname, middlename, lastname } = consenter;
  const retval = { 
    consenter, 
    fullName:PdfForm.fullName(firstname, middlename, lastname), 
    consentStatus:status, 
    entities 
  } as ConsenterInfo;
  debugLog(retval, `Returning`);

  return retval;
}

/**
 * Get a consenters database record.
 * @param parm 
 * @returns 
 */
export const getConsenterResponse = async (parm:string|Consenter, includeEntityList:boolean=true): Promise<LambdaProxyIntegrationResponse> => {
  let email = (typeof (parm ?? '') == 'string') ? parm as string : (parm as Consenter).email;
  if( ! email) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingEmail)
  }
  email = email.toLowerCase();
  const consenterInfo = await getConsenterInfo(parm, includeEntityList);
  if( ! consenterInfo) {
    return okResponse(`No such consenter: ${parm}`);
  }
  return okResponse('Ok', consenterInfo);
}

export type AppendTimestampParms = {
  consenter:Consenter, timestampFldName:ConsenterFields, active:YN, removeSub?:boolean
}

/**
 * Append to one of the timestamp array fields of the consenter.
 * @param email 
 * @param timestampFldName 
 * @returns 
 */
export const appendTimestamp = async (parms:AppendTimestampParms): Promise<LambdaProxyIntegrationResponse> => {
  let { active, consenter, timestampFldName, removeSub=false } = parms;
  if( ! consenter) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.noSuchConsenter)
  }

  // Append a new item to the specified timestamp array of the consenter object
  const { email } = consenter;
  const dte = new Date().toISOString();
  if( ! consenter[timestampFldName]) {
    consenter = Object.assign(consenter, { [timestampFldName]: [] as string[]})
  }
  (consenter[timestampFldName] as string[]).push(dte);
  
  // Apply the same change at the backend on the database record
  await ConsenterCrud({
    consenterInfo: {
      email,
      [timestampFldName]: consenter[timestampFldName],
      active
    } as unknown as Consenter,
    removeSub
  }).update();
  
  // Return a response with an updated consenter info payload
  return getConsenterResponse(consenter, false);
};


/**
 * Return a path to the consenting person default dashboard so the user can locate the consent form
 * "email to self" feature for their consent form.
 * @param consenterEmail 
 * @returns 
 */
export const consentFormUrl = (consenterEmail:string):string => {
  const context:IContext = <IContext>ctx;
  return `https://${process.env.CLOUDFRONT_DOMAIN}${context.CONSENTING_PERSON_PATH}`;

  /**
   * TODO:
   *  
   * 1) Figure out how each reference to this function can pass in the url of the request that triggered 
   * the call. This will allow the function to return a url that can reflect the bootstrap app if the request
   * came from there, as opposed to defaulting to the non-bootstrap app.
   * 
   * 2) Optional: Have the link that is returned here refer to a specific api endpoint for downloading the
   * consent form, directly instead of the dashboard. If the user is not logged in, the link would have
   * to contain a querystring parameter that signals the index.htm page to stash in session state that form 
   * downloading is was requested so that when cognito redirects back to the page, the stashed state can be
   * referenced and an automatic call to the api endpoint made to download the form (no email needed).
   * This makes it so that the user need only navigate to the link returned here, possible authenticate, and
   * then get a form download dialog box - they do not need to locate the form emailing feature and use it.
   */
}


export const sendForm = async (consenter:Consenter, callback:(consenterInfo:ConsenterInfo) => Promise<void>): Promise<LambdaProxyIntegrationResponse> => {
  const { email } = consenter;
  let consenterInfo:ConsenterInfo|null;
  if(email && Object.keys(consenter).length == 1) {
    // email was the only piece of information provided about the consenter, so retrieve the rest from the database.
    consenterInfo = await getConsenterInfo(email, false) as ConsenterInfo;
    if(consenterInfo) {
      const { consenter, consenter: { firstname, middlename, lastname}} = consenterInfo ?? { consenter: {}};
      consenterInfo = { 
        consenter, 
        fullName: PdfForm.fullName(firstname, middlename, lastname),
        consentStatus:(await consentStatus(consenter))
      };
    }
    else {
      return errorResponse(`Cannot find consenter ${email}`);
    }  
  }
  else {
    const { firstname, middlename, lastname } = consenter ?? {};
    consenterInfo = { 
      consenter, 
      fullName: PdfForm.fullName(firstname, middlename, lastname),
      consentStatus:(await consentStatus(consenter))
    };
  }

  await callback(consenterInfo);

  return okResponse('Ok', consenterInfo);
}

/**
 * Create a delayed execution to remove an exhibit form at a point in the future determined by app configuration
 * @param newConsenter 
 * @param exhibitForm 
 */
export const scheduleExhibitFormPurgeFromDatabase = async (newConsenter:Consenter, exhibitForm:ExhibitForm, offsetDate?:Date) => {
  const envVarName = DelayedExecutions.ExhibitFormDbPurge.targetArnEnvVarName;
  const functionArn = process.env[envVarName];
  if(functionArn) {
    const configs = new Configurations();
    const waitTime = (await configs.getAppConfig(ConfigNames.DELETE_DRAFTS_AFTER)).getDuration();
    const lambdaInput = { consenterEmail: newConsenter.email, entity_id: exhibitForm.entity_id, delaySeconds:waitTime };
    const delayedTestExecution = new DelayedLambdaExecution(functionArn, lambdaInput);
    const { SECONDS } = PeriodType;
    const timer = EggTimer.getInstanceSetFor(waitTime, SECONDS); 
    await delayedTestExecution.startCountdown(timer, ID, Description);
  }
  else {
    console.error(`Cannot schedule ${Description}: ${envVarName} variable is missing from the environment!`);
  }
}


/**
 * Get an inventory of what exists in the s3 bucket in terms of affiliates for the specified consenter and entity.
 * Corrections can only apply to these. 
 * @param email 
 * @param entity_id 
 */
export const getCorrectableAffiliates = async (email:string, entityId:string, checkConsentStatus:boolean=false):Promise<LambdaProxyIntegrationResponse> => {
  if(checkConsentStatus) {
    const consenterInfo = await getConsenterInfo(email, false) as ConsenterInfo;
    if( ! consenterInfo) {
      return invalidResponse(INVALID_RESPONSE_MESSAGES.noSuchConsenter);
    }
    const { consentStatus } = consenterInfo;
    const { ACTIVE, EXPIRED } = ConsentStatus;
    if(consentStatus != ACTIVE) {
      if(consentStatus == EXPIRED) {
        return invalidResponse(INVALID_RESPONSE_MESSAGES.expiredConsent);
      }
      if(consenterInfo?.consenter?.active != YN.Yes) {
        return invalidResponse(INVALID_RESPONSE_MESSAGES.inactiveConsenter);
      }
      return invalidResponse(INVALID_RESPONSE_MESSAGES.missingConsent);
    }
  }

  const inventory = await BucketInventory.getInstance(email, entityId); 
  inventory.getAffiliateEmails();
  return okResponse('Ok', { affiliateEmails: inventory.getAffiliateEmails() });
}