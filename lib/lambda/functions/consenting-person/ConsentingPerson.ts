import { DeleteObjectsCommandOutput } from "@aws-sdk/client-s3";
import { CONFIG, IContext } from "../../../../contexts/IContext";
import { DelayedExecutions } from "../../../DelayedExecution";
import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { lookupUserPoolId } from "../../_lib/cognito/Lookup";
import { Configurations } from "../../_lib/config/Config";
import { DAOFactory } from "../../_lib/dao/dao";
import { ConsenterCrud } from "../../_lib/dao/dao-consenter";
import { ENTITY_WAITING_ROOM } from "../../_lib/dao/dao-entity";
import { Affiliate, AffiliateTypes, ConfigNames, Consenter, ConsenterFields, Entity, ExhibitForm, Roles, User, YN } from "../../_lib/dao/entity";
import { ConsentFormData } from "../../_lib/pdf/ConsentForm";
import { PdfForm } from "../../_lib/pdf/PdfForm";
import { DelayedLambdaExecution } from "../../_lib/timer/DelayedExecution";
import { EggTimer, PeriodType } from "../../_lib/timer/EggTimer";
import { ComparableDate, debugLog, deepClone, error, errorResponse, getMostRecent, invalidResponse, log, lookupCloudfrontDomain, okResponse, warn } from "../../Utils";
import { sendDisclosureRequest } from "../authorized-individual/AuthorizedIndividual";
import { BucketInventory } from "./BucketInventory";
import { BucketItem, DisclosureItemsParms, Tags } from "./BucketItem";
import { BucketDisclosureForm } from "./BucketItemDisclosureForm";
import { BucketExhibitForm } from "./BucketItemExhibitForm";
import { ExhibitBucket } from "./BucketItemExhibitForms";
import { BucketItemMetadata, BucketItemMetadataParms, ExhibitFormsBucketEnvironmentVariableName, ItemType } from "./BucketItemMetadata";
import { TagInspector } from "./BucketItemTag";
import { ConsentFormEmail } from "./ConsentEmail";
import { ConsentingPersonToCorrect } from "./correction/Correction";
import { ExhibitCorrectionEmail } from "./correction/ExhibitCorrectionEmail";
import { ExhibitEmail, FormTypes } from "./ExhibitEmail";
import { deleteExhibitForm, RulePrefix as DbRulePrefix } from "../delayed-execution/PurgeExhibitFormFromDatabase";
import { RulePrefix as S3RulePrefix } from "../delayed-execution/PurgeExhibitFormFromBucket"
import { CognitoStandardAttributes, UserAccount } from "../../_lib/cognito/UserAccount";
import { IndividualRegistrationFormData, IndividualRegistrationFormEmail } from "./RegistrationEmail";

export enum Task {
  SAVE_EXHIBIT_FORM = 'save-exhibit-form',
  CORRECT_EXHIBIT_FORM = 'correct-exhibit-form',
  SEND_EXHIBIT_FORM = 'send-exhibit-form',
  GET_CONSENTER = 'get-consenter',
  REGISTER_CONSENT = 'register-consent',
  RENEW_CONSENT = 'renew-consent',
  RESCIND_CONSENT = 'rescind-consent',
  SEND_CONSENT = 'send-consent',
  CORRECT_CONSENTER = 'correct-consenter',
  GET_CORRECTABLE_AFFILIATES = 'get-correctable-affiliates',
  PING = 'ping'
}

export const INVALID_RESPONSE_MESSAGES = {
  missingOrInvalidTask: 'Invalid/Missing task parameter!',
  missingTaskParms: 'Missing parameters parameter for:',
  missingEmail: 'Missing email parameter',
  missingExhibitData: 'Missing exhibit form data!',
  missingAffiliateRecords: 'Missing affiliates in exhibit form data!',
  missingExhibitFormIssuerEmail: 'Missing email of exhibit form issuer!',
  missingEntityId: 'Missing entity_id!',
  missingConsent: 'Consent is required before the requested operation can be performed',
  invalidAffiliateRecords: 'Affiliate item with missing/invalid value',
  inactiveConsenter: 'Consenter is inactive',
  noSuchConsenter: 'No such consenter',
  emailFailures: `There were one or more email failures related to exhibit form activty for INSERT_EMAIL. 
  Therefore removal of the corresponding data from the consenters database record is deferred until its natural expiration`
}

export type ConsenterInfo = {
  consenter:Consenter, fullName:string, activeConsent:boolean, entities?:Entity[]
}

export type ExhibitFormCorrection = {
  entity_id:string, updates:Affiliate[], appends:Affiliate[], deletes:string[]
}

/**
 * This function performs all actions a CONSENTING_PERSON can take.
 * @param event 
 * @returns 
 */
export const handler = async (event:any):Promise<LambdaProxyIntegrationResponse> => {
  try {
    debugLog(event);
      
    const payloadJson = event.headers[AbstractRoleApi.ETTPayloadHeader];
    const payload = payloadJson ? JSON.parse(payloadJson) as IncomingPayload : null;
    let { task, parameters } = payload || {};

    if( ! Object.values<string>(Task).includes(task || 'undefined')) {
      return invalidResponse(`${INVALID_RESPONSE_MESSAGES.missingOrInvalidTask} ${task}`);
    }
    else if( ! parameters) {
      return invalidResponse(`${INVALID_RESPONSE_MESSAGES.missingTaskParms} ${task}`);
    }
    else {
      log(`Performing task: ${task}`);
      const callerUsername = event?.requestContext?.authorizer?.claims?.username;
      const callerSub = callerUsername || event?.requestContext?.authorizer?.claims?.sub;
      const { email, exhibit_data:exhibitForm, entityName, entity_id, corrections } = parameters;
      switch(task as Task) {
        case Task.GET_CONSENTER:
          return await getConsenterResponse(email);
        case Task.REGISTER_CONSENT:
          return await registerConsent(email);
        case Task.RENEW_CONSENT:
          return await renewConsent(email);
        case Task.RESCIND_CONSENT:
          return await rescindConsent(email);
        case Task.SEND_CONSENT:
          return await sendConsent( { email } as Consenter, entityName);
        case Task.CORRECT_CONSENTER:
          return await correctConsenter(parameters);
        case Task.SAVE_EXHIBIT_FORM:
          return await saveExhibitData(email, exhibitForm);
        case Task.SEND_EXHIBIT_FORM:
          return await sendExhibitData(email, exhibitForm);
        case Task.CORRECT_EXHIBIT_FORM:
          return await correctExhibitData(email, corrections);
        case Task.GET_CORRECTABLE_AFFILIATES:
          return await getCorrectableAffiliates(email, entity_id);
        case Task.PING:
          return okResponse('Ping!', parameters); 
      }
    }
  }
  catch(e:any) {
    console.error(e);
    return errorResponse(`Internal server error: ${e.message}`);
  }
}


/**
 * Get a consenters database record.
 * @param parm 
 * @returns 
 */
export const getConsenterResponse = async (parm:string|Consenter, includeEntityList:boolean=true): Promise<LambdaProxyIntegrationResponse> => {
  const email = (typeof (parm ?? '') == 'string') ? parm as string : (parm as Consenter).email;
  if( ! email) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingEmail)
  }
  const consenterInfo = await getConsenterInfo(parm, includeEntityList);
  if( ! consenterInfo) {
    return okResponse(`No such consenter: ${parm}`);
  }
  return okResponse('Ok', consenterInfo);
}

/**
 * Determine from consent, renew, and rescind dates what the consent status for a consenter is.
 * @param consenter 
 * @returns 
 */
export const isActiveConsent = (consenter:Consenter):boolean => {

  const { consented_timestamp, rescinded_timestamp, renewed_timestamp, active } = consenter;
  const consented = getMostRecent(consented_timestamp);
  let activeConsent:boolean = false;
  if(consented && `${active}` == YN.Yes) {
    const rescinded = getMostRecent(rescinded_timestamp);
    const renewed = getMostRecent(renewed_timestamp);
    const consentedDate = ComparableDate(consented);
    const rescindedDate = ComparableDate(rescinded);
    const renewedDate = ComparableDate(renewed);

    if(consentedDate.after(rescindedDate) && consentedDate.after(renewedDate)) {
      activeConsent = true; // Consent was given
    }
    if(renewedDate.after(consentedDate) && renewedDate.after(rescindedDate)) {
      activeConsent = true; // Consent was rescinded but later restored
    }
    if(rescindedDate.after(consentedDate) && rescindedDate.after(renewedDate)) {
      activeConsent = false; // Consent was rescinded
    }
  }
  return activeConsent;
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
  const activeConsent = isActiveConsent(consenter);
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
    activeConsent, 
    entities 
  } as ConsenterInfo;
  debugLog(retval, `Returning`);

  return retval;
}

/**
 * Append to one of the timestamp array fields of the consenter.
 * @param email 
 * @param timestampFldName 
 * @returns 
 */
export const appendTimestamp = async (consenter:Consenter, timestampFldName:ConsenterFields, active:YN): Promise<LambdaProxyIntegrationResponse> => {
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
  const dao = DAOFactory.getInstance({ DAOType: 'consenter', Payload: {
    email,
    [timestampFldName]: consenter[timestampFldName],
    active
  } as unknown as Consenter });
  await dao.update();
  
  // Return a response with an updated consenter info payload
  return getConsenterResponse(consenter, false);
};

/**
 * Register consent by applying a consented_timestamp value to the consenter database record.
 * @param email 
 * @returns 
 */
export const registerConsent = async (email:string): Promise<LambdaProxyIntegrationResponse> => {
  log(`Registering consent for ${email}`);
  
  // Abort if consenter lookup fails
  let consenterInfo = await getConsenterInfo(email, false) as ConsenterInfo;
  if( ! consenterInfo) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.noSuchConsenter + ' ' + email );
  }

  const response = await appendTimestamp(
    consenterInfo.consenter, 
    ConsenterFields.consented_timestamp,
    YN.Yes
  );
  consenterInfo = JSON.parse(response.body ?? '{}')['payload'] as ConsenterInfo;
  const { consenter } = consenterInfo ?? {};
  if(consenter) {
    await sendConsent(consenter, 'any entity');
  }
  return response;
}

/**
 * Renew consent by applying a renewed_timestamp value to the consenter database record.
 * @param email 
 * @returns 
 */
export const renewConsent = async (email:string): Promise<LambdaProxyIntegrationResponse> => {
  log(`Renewing consent for ${email}`);
  
  // Abort if consenter lookup fails
  let consenterInfo = await getConsenterInfo(email, true) as ConsenterInfo;
  if( ! consenterInfo) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.noSuchConsenter + ' ' + email );
  }

  // Abort if the consenter has not yet consented
  // if( ! consenterInfo?.activeConsent) {
  //   if(consenterInfo?.consenter?.active == YN.No) {
  //     return invalidResponse(INVALID_RESPONSE_MESSAGES.inactiveConsenter);
  //   }
  //   return invalidResponse(INVALID_RESPONSE_MESSAGES.missingConsent);
  // }

  return appendTimestamp(
    consenterInfo.consenter, 
    ConsenterFields.renewed_timestamp,
    YN.Yes
  );
}

/**
 * Rescind the consenting individuals consent.
 * @param email 
 * @returns 
 */
export const rescindConsent = async (email:string): Promise<LambdaProxyIntegrationResponse> => {
  log(`Rescinding consent for ${email}`);
  
  // Abort if consenter lookup fails
  const consenterInfo = await getConsenterInfo(email, true) as ConsenterInfo;
  if( ! consenterInfo) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.noSuchConsenter + ' ' + email );
  }

  const { consenter, consenter: { exhibit_forms=[] } } = consenterInfo;

  // Delete all exhibit form data from the consenters database record.
  for(let i=0; i<exhibit_forms.length; i++) {
    await deleteExhibitForm(email, exhibit_forms[i].entity_id, 0);
  }

  // Delete the consenter from the cognito userpool.
  const attributes = { email: { propname:'email', value:email } } as CognitoStandardAttributes;
  const userAccount = await UserAccount.getInstance(attributes, Roles.CONSENTING_PERSON);
  await userAccount.Delete();

  // Flip the consenter database record to inactive and push the current timestamp to its rescinded array.
  return appendTimestamp(
    consenter, 
    ConsenterFields.rescinded_timestamp,
    YN.No
  );
};

/**
 * Correct consenter details.
 * @param parameters 
 * @returns 
 */
export const correctConsenter = async (parameters:any): Promise<LambdaProxyIntegrationResponse> => {
  const { email:existing_email, new_email:email, firstname, middlename, lastname, phone_number } = parameters;
  log(parameters, `Correcting consenter details`);
  
  const consenter = new ConsentingPersonToCorrect({ email:existing_email } as Consenter);
  const updated:boolean = await consenter.correct({
    email, phone_number, firstname, middlename, lastname
  } as Consenter);
  
  if( ! updated) {
    console.error(`Failed to correct consenter: ${consenter.getMessage()}`);
    return errorResponse(consenter.getMessage())
  }
  
  return getConsenterResponse(email, false);
};

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
        activeConsent:isActiveConsent(consenter) 
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
      activeConsent:isActiveConsent(consenter)
    };
  }

  await callback(consenterInfo);

  return okResponse('Ok', consenterInfo);
}

/**
 * Send a pdf copy of the consent form to the consenter
 * @param email 
 * @returns 
 */
export const sendConsent = async (consenter:Consenter, entityName?:string): Promise<LambdaProxyIntegrationResponse> => {
  const { email } = consenter;
  entityName = entityName ?? 'Any entity registered with ETT';
  log(`Sending consent form to ${email}`);
  return sendForm(consenter, async (consenterInfo:ConsenterInfo) => {
    await new ConsentFormEmail({ 
      consenter:consenterInfo.consenter, entityName 
    } as ConsentFormData).send(email);
  });
};

/**
 * Send a pdf copy of the registration form to the consenter
 * @param email 
 * @returns 
 */
export const sendRegistration = async (consenterInfo:Consenter, entityName:string, loginHref?:string): Promise<LambdaProxyIntegrationResponse> => {
  const { email } = consenterInfo;
  const consenter = await ConsenterCrud(consenterInfo).read() as Consenter;
  if( ! consenter) {
    return errorResponse(`Cannot send registration form to ${email}: Consenter not found`);
  }
  log(`Sending registration forms to ${email}`);
  return sendForm(consenter, async (consenterInfo:ConsenterInfo) => {
    await new IndividualRegistrationFormEmail({ 
      consenter:consenterInfo.consenter, entityName, loginHref 
    } as IndividualRegistrationFormData).send(email);
  });
};

/**
 * Save exhibit form data to the database.
 * @param email 
 * @param exhibitForm 
 * @param isNew Save a new exhibit form (true) or update and existing one (false)
 * @returns 
 */
export const saveExhibitData = async (email:string, exhibitForm:ExhibitForm): Promise<LambdaProxyIntegrationResponse> => {
  // Validate incoming data
  if( ! exhibitForm) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingExhibitData);
  }

  // Abort if consenter lookup fails
  const consenterInfo = await getConsenterInfo(email, false) as ConsenterInfo;
  if( ! consenterInfo) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.noSuchConsenter + ' ' + email );
  }

  // Abort if the consenter has not yet consented
  if( ! consenterInfo?.activeConsent) {
    if(consenterInfo?.consenter?.active == YN.No) {
      return invalidResponse(INVALID_RESPONSE_MESSAGES.inactiveConsenter);
    }
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingConsent);
  }

  // Abort if the exhibit form has no affiliates
  const { affiliates, entity_id } = exhibitForm;
  if( ! affiliates || affiliates.length == 0) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingAffiliateRecords);
  }

  // Ensure that an existing exhibit form cannot have its create_timestamp refreshed - this would inferfere with expiration.
  const { consenter:oldConsenter } = consenterInfo;
  const { exhibit_forms:existingForms } = oldConsenter;
  const matchingIdx = (existingForms ?? []).findIndex(ef => {
    ef.entity_id == exhibitForm.entity_id;
  });
  if(matchingIdx == -1 && ! exhibitForm.create_timestamp) {
    // Updating an existing exhibit form
    exhibitForm.create_timestamp = new Date().toISOString();
  }
  else {
    // Creating a new exhibit form
    const { create_timestamp:existingTimestamp } = (existingForms ?? [])[matchingIdx];
    const newTimestamp = new Date().toISOString();
    const info = `consenter:${email}, exhibit_form:${exhibitForm.entity_id}`;
    if( ! existingTimestamp) {
      log(`Warning: Illegal state - existing exhibit form found without create_timestamp! ${info}`);
    }
    if(exhibitForm.create_timestamp) {
      if(exhibitForm.create_timestamp != (existingTimestamp || exhibitForm.create_timestamp)) {
        log(`Warning: Updates to exhibit form create_timestamp are disallowed: ${info}`);
      }
    }
    exhibitForm.create_timestamp = existingTimestamp || newTimestamp;
  }

  // Update the consenter record by creating/modifying the provided exhibit form.
  const newConsenter = deepClone(oldConsenter) as Consenter;
  newConsenter.exhibit_forms = [ exhibitForm ];
  const dao = ConsenterCrud(newConsenter);
  await dao.update(oldConsenter, true); // NOTE: merge is set to true - means that other exhibit forms are retained.

  // Create a delayed execution to remove the exhibit form 2 days from now
  await scheduleExhibitFormPurgeFromDatabase(newConsenter, exhibitForm);

  return getConsenterResponse(email, true);
};

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
    await delayedTestExecution.startCountdown(timer, DbRulePrefix);
  }
  else {
    console.error(`Cannot schedule ${DbRulePrefix}: ${envVarName} variable is missing from the environment!`);
  }
}

/**
 * Send full exhibit form to each authorized individual of the entity, remove it from the database, and save
 * each constituent single exhibit form to s3 for temporary storage.
 * @param consenterEmail 
 * @param exhibitForm 
 * @returns 
 */
export const sendExhibitData = async (consenterEmail:string, exhibitForm:ExhibitForm): Promise<LambdaProxyIntegrationResponse> => {
  
  const emailFailuresForEntityStaff = [] as string[];
  const emailFailures = () => { return emailFailuresForEntityStaff.length > 0; }

  const bucketItemAddFailures = [] as string[];
  const bucketAddFailures = () => { return bucketItemAddFailures.length > 0; }
  
  const affiliates = [] as Affiliate[];
  let badResponse:LambdaProxyIntegrationResponse|undefined;
  let entity_id:string|undefined;
  let consenter = {} as Consenter;
  let entity = {} as Entity;
  let entityReps = [] as User[];

  const throwError = (msg:string, payload?:any) => {
    badResponse = invalidResponse(msg, payload);
    throw new Error(msg);
  }

  const validatePayload = () => {

    // Validate incoming data
    if( ! exhibitForm) {
      throwError(INVALID_RESPONSE_MESSAGES.missingExhibitData);
    }
    let { affiliates: _affiliates, entity_id: _entity_id } = exhibitForm as ExhibitForm;
    if( ! _entity_id ) {
      throwError(INVALID_RESPONSE_MESSAGES.missingEntityId);
    }
    entity_id = _entity_id;
    if( ! consenterEmail) {
      throwError(INVALID_RESPONSE_MESSAGES.missingExhibitFormIssuerEmail);
    }

    // Validate incoming affiliate data
    if(_affiliates && _affiliates.length > 0) {
      for(const affiliate of _affiliates) {
        let { affiliateType, email, fullname, org, phone_number, title } = affiliate;

        if( ! Object.values<string>(AffiliateTypes).includes(affiliateType)) {
          throwError(`${INVALID_RESPONSE_MESSAGES.invalidAffiliateRecords} - affiliatetype: ${affiliateType}`);
        }
        if( ! email) {
          throwError(`${INVALID_RESPONSE_MESSAGES.invalidAffiliateRecords}: email`);
        }
        if( ! fullname) {
          throwError(`${INVALID_RESPONSE_MESSAGES.invalidAffiliateRecords}: fullname`);
        }
        if( ! org) {
          throwError(`${INVALID_RESPONSE_MESSAGES.invalidAffiliateRecords}: org`);
        }
        // TODO: Should phone_number and title be left optional?
      };
    }
    else {
      throwError(INVALID_RESPONSE_MESSAGES.missingAffiliateRecords);
    }

    if(_affiliates) {
      if(_affiliates instanceof Array) {
        affiliates.push(... _affiliates as Affiliate[]);
      }
      else {
        affiliates.push(_affiliates);
      }
    }
  }

  /**
   * If the consenter did not save their last exhibit form entries before submitting them, their database
   * record will not reflect those latest entries, so merge the two now.
   */
  const mergeExhibitFormIntoConsenterData = () => {
    const { exhibit_forms=[] } = consenter;
    const efIdx = exhibit_forms.findIndex(ef => {
      return ef.entity_id == exhibitForm.entity_id;
    });
    if(efIdx == -1) {
      exhibit_forms.push(exhibitForm);
    }
    else {
      exhibit_forms[efIdx] = exhibitForm;
    }
    consenter.exhibit_forms = exhibit_forms;
  }

  const loadInfoFromDatabase = async () => {
    // Get the consenter
    const consenterInfo = await getConsenterInfo(consenterEmail, false) as ConsenterInfo;
    const { consenter: _consenter, activeConsent } = consenterInfo ?? {};

    // Abort if there is no matching consenter found
    if( ! consenter) {
      throwError(INVALID_RESPONSE_MESSAGES.noSuchConsenter);
    }

    // Abort if the consenter has not yet consented
    if( ! activeConsent) {
      throwError(INVALID_RESPONSE_MESSAGES.missingConsent);
    }

    consenter = _consenter;

    mergeExhibitFormIntoConsenterData();

    // Get the entity
    const daoEntity = DAOFactory.getInstance({ DAOType:"entity", Payload: { entity_id }});
    entity = await daoEntity.read() as Entity;

    // Get the authorized individuals of the entity.
    const daoUser = DAOFactory.getInstance({ DAOType:'user', Payload: { entity_id }});
    let _users = await daoUser.read() as User[];
    _users = _users.filter(user => user.active == YN.Yes && (user.role == Roles.RE_AUTH_IND || user.role == Roles.RE_ADMIN));
    entityReps.push(..._users);

  }

  /**
   * Save the single exhibit form excerpts of the full exhibit form to the s3 bucket.
   */
  const transferSingleExhibitFormsToBucket = async () => {
    const now = new Date();
    const { EXHIBIT, DISCLOSURE } = ItemType;
    const { SECONDS } = PeriodType;
    const configs = new Configurations();
    const { DELETE_EXHIBIT_FORMS_AFTER: deleteAfter} = ConfigNames;

    for(let i=0; i<affiliates.length; i++) {
      let metadata = { 
        consenterEmail,
        entityId:entity.entity_id, 
        affiliateEmail:affiliates[i].email,
        savedDate: now
      } as BucketItemMetadataParms;

      try {
        // 1) Save a copy of the single exhibit form pdf to the s3 bucket
        metadata.itemType = EXHIBIT;
        const s3ObjectKeyForExhibitForm = await new BucketExhibitForm(metadata).add(consenter);

        // 2) Save a copy of the disclosure form to the s3 bucket
        metadata.itemType = DISCLOSURE;
        const authorizedIndividuals = entityReps.filter(user => user.active == YN.Yes && (user.role == Roles.RE_AUTH_IND));
        const s3ObjectKeyForDisclosureForm = await new BucketDisclosureForm({
          requestingEntity: entity,
          requestingEntityAuthorizedIndividuals: authorizedIndividuals,
          metadata
        }).add(consenter);

        // 3) Schedule actions against the pdfs that limit how long they survive in the bucket the were just saved to.
        const envVarName = DelayedExecutions.ExhibitFormBucketPurge.targetArnEnvVarName;
        const functionArn = process.env[envVarName];
        if(functionArn) {        
          const lambdaInput = {
            consenterEmail:consenter.email,
            s3ObjectKeyForDisclosureForm,
            s3ObjectKeyForExhibitForm
          } as DisclosureItemsParms;        
          const delayedTestExecution = new DelayedLambdaExecution(functionArn, lambdaInput);
          const waitTime = (await configs.getAppConfig(deleteAfter)).getDuration();
          const timer = EggTimer.getInstanceSetFor(waitTime, SECONDS); 
          await delayedTestExecution.startCountdown(timer, `${S3RulePrefix} (${consenter.email})`);
        }
        else {
          console.error(`Cannot schedule ${deleteAfter} ${S3RulePrefix}: ${envVarName} variable is missing from the environment!`);
        }
      }
      catch(e) {
        error(e);
        bucketItemAddFailures.push(BucketItemMetadata.toBucketFileKey(metadata));
      }
    }
  }

  
  /**
   * Send the full exhibit form to each authorized individual and the RE admin.
   */
  const sendFullExhibitFormToEntityStaff = async () => {
    emailFailuresForEntityStaff.length = 0;
    for(let i=0; i<entityReps.length; i++) {
      var sent:boolean = await new ExhibitEmail(exhibitForm, FormTypes.FULL, entity, consenter).send(entityReps[i].email);
      if( ! sent) {
        emailFailuresForEntityStaff.push(entityReps[i].email);
      }
    }
  }

  /**
   * Prune a full exhibit form from the consenters database record
   */
  const pruneExhibitFormFromDatabaseRecord = async () => {
    if(bucketAddFailures()) {
      log(`There were failures related to file storage for exhibit forms for ${consenter.email}. 
        Therefore removal of the corresponding data from the consenters database record is deferred until its natural expiration`);
      return;
    }
    if(emailFailures()) {
      log(`There were email failures related to exhibit form activty for ${consenter.email}. 
        Therefore removal of the corresponding data from the consenters database record is deferred until its natural expiration`);
      return;
    }
    const updatedConsenter = deepClone(consenter) as Consenter;
    const { exhibit_forms:efs=[]} = updatedConsenter;
    // Prune the exhibit form that corresponds to the entity from the consenters exhibit form listing.
    updatedConsenter.exhibit_forms = efs.filter(ef => {
      return ef.entity_id != entity.entity_id;
    })
    // Update the database record with the pruned exhibit form listing.
    const dao = DAOFactory.getInstance({ DAOType:'consenter', Payload: updatedConsenter});
    // const dao = ConsenterCrud(updatedConsenter);
    await dao.update(consenter);
  }

  /**
   * Return the standard ok response with refreshed consenter info, or an error message if there were email failures
   * @param email 
   * @param includeEntityList 
   * @returns 
   */
  const getResponse = async (email:string, includeEntityList:boolean=true): Promise<LambdaProxyIntegrationResponse> => {
    if(emailFailures()) {
      const msg = 'Internal server error: ' + INVALID_RESPONSE_MESSAGES.emailFailures.replace('INSERT_EMAIL', consenter.email);
      const failedEmails = [...emailFailuresForEntityStaff];
      const payload = { failedEmails };
      return errorResponse(msg, payload);
    }
    return getConsenterResponse(email, true);
  }

  try {

    validatePayload();

    await loadInfoFromDatabase();
    
    await transferSingleExhibitFormsToBucket();
    
    await sendFullExhibitFormToEntityStaff();

    await pruneExhibitFormFromDatabaseRecord();

    return getResponse(consenterEmail, true);
  }
  catch(e:any) {
    console.error(e);
    if(badResponse) {
      return badResponse;
    }
    return errorResponse(`Internal server error: ${e.message}`);
  }
}

/**
 * Get an inventory of what exists in the s3 bucket in terms of affiliates for the specified consenter and entity.
 * Corrections can only apply to these. 
 * @param email 
 * @param entity_id 
 */
const getCorrectableAffiliates = async (email:string, entityId:string):Promise<LambdaProxyIntegrationResponse> => {
  const inventory = await BucketInventory.getInstance(email, entityId); 
  inventory.getAffiliateEmails();
  return okResponse('Ok', { affiliateEmails: inventory.getAffiliateEmails() });
}

/**
 * Take in corrected exhibit form data for a full exhibit form previously submitted to a specified entity.
 * Perform bucket appends and removals where indicated and send corrected single exhibit form to each 
 * authorized individual of the entity (and affiliate(s) if disclosure requests have already been sent to them).
 * @param email 
 * @param exhibitForm 
 * @returns 
 */
export const correctExhibitData = async (consenterEmail:string, corrections:ExhibitFormCorrection): Promise<LambdaProxyIntegrationResponse> => {
  const { entity_id, appends=[], deletes=[], updates=[] } = corrections;
  const { toBucketFolderKey } = BucketItemMetadata
  const inventory = await BucketInventory.getInstance(consenterEmail, entity_id);
  const emails = inventory.getAffiliateEmails();  
  const disclosuresRequestCache = [] as string[]; // Cache the output of any s3 object tag lookups

  // Validate that no existing affiliate from the bucket matches any affiliate being submitted as new.
  const invalidAppend = appends.find(affiliate => emails.includes(affiliate.email));
  if(invalidAppend) {
    return invalidResponse(`The affiliate "${invalidAppend.email} can only be replaced, not submitted as a new entry.`);
  }

  type SendDisclosureRequestParms = {
    EF_S3ObjectKey:string,
    DR_S3ObjectKey:string,
    affiliateEmail:string,
    reSend?:boolean
  }
  /**
   * If disclosure requests have already been sent to the updated affiliates, reissue them and schedule
   * 2 new reminders. Any existing schedules will defer to these new ones - a corresponding check in the
   * event bridge rule lambda function ensures this).
   * @param EF_S3ObjectKey 
   * @param DR_S3ObjectKey 
   * @param affiliateEmail 
   */
  const sendDisclosureRequestEmails = async (parms:SendDisclosureRequestParms, allAffiliates:boolean=false) => {
    const { DR_S3ObjectKey, EF_S3ObjectKey, affiliateEmail, reSend=false } = parms;
    let metadata = { consenterEmail, entityId:entity_id, affiliateEmail, itemType:ItemType.EXHIBIT } as BucketItemMetadataParms;
    let sendable = true;

    if(allAffiliates) {
      delete metadata.affiliateEmail
    }

    if(reSend) {
      // A disclosure request is resendable if one was already sent for the affiliate
      let s3ObjectPath = toBucketFolderKey(metadata);
      if( ! disclosuresRequestCache.includes(s3ObjectPath)) {
        // Check s3 tagging on s3 objects for evidence of a specific disclosure request having been sent.
        let tagFound = await new TagInspector(Tags.DISCLOSED).tagExistsAmong(s3ObjectPath, ItemType.EXHIBIT);
        if(tagFound) {
          disclosuresRequestCache.push(s3ObjectPath);
        }
        else if ( ! allAffiliates) {
          // expand the search to ANY affiliate in case this is a new affiliate (we are not allowing some 
          // affiliates to have been sent disclosure requests while others have not)
          await sendDisclosureRequestEmails(parms, true);
          return;
        }
        else {          
          sendable = false;
        }
      }
    }

    if(sendable) {

      // Send the disclosure request
      await sendDisclosureRequest(consenterEmail, entity_id, affiliateEmail);

      // Tag the items in s3 bucket accordingly.
      const now = new Date().toISOString();
      const bucket = new BucketItem();       
      await bucket.tag(EF_S3ObjectKey, Tags.DISCLOSED, now);
      await bucket.tag(DR_S3ObjectKey, Tags.DISCLOSED, now);
      return;
    }
    log({ consenterEmail, entity_id, affiliateEmail }, `No initial disclosure request to reissue for`);
  }

  // Handle deleted affiliates
  const successfulDeletes = [] as string[];
  if(deletes.length > 0) {
    for(let i=0; i<deletes.length; i++) {

      // Bail if for some weird reason the target of the correction cannot be found.
      if( ! inventory.hasAffiliate(deletes[i], entity_id)) {
        warn(
          { consenterEmail, entity_id, affiliateEmail:deletes[i] }, 
          'Attempt to delete an affiliate for which nothing deletable can be found'
        );
        continue;
      }

      // Delete the affiliate "directory" for the specified consenter/exhibit path in the bucket.
      // NOTE: Any event bridge rules that schedule disclosure requests/reminders for the deleted items 
      // will search for them by key(s), fail to find them, error silently, and eventually themselves 
      // be deleted (if final reminder). This is easier than trying to find those rules and delete them here.
      const result:DeleteObjectsCommandOutput|void = await new ExhibitBucket({ email:consenterEmail } as Consenter).deleteAll({
        consenterEmail,
        entityId:entity_id,
        affiliateEmail:deletes[i]
      } as BucketItemMetadataParms);
      if(result) {
        successfulDeletes.push(deletes[i]);
      }
    }
  }

  // Handle updated affiliates
  const successfulUpdates = [] as Affiliate[];
  if(updates.length > 0) {
    const consenter = { email:consenterEmail, exhibit_forms: [ { entity_id, affiliates:updates } ]} as Consenter;
    for(let i=0; i<updates.length; i++) {
      const { email:affiliateEmail } = updates[i];

      // Bail if for some weird reason the target of the correction cannot be found.
      if( ! inventory.hasAffiliate(affiliateEmail, entity_id)) {
        console.warn(`Attempt to correct an affiliate for which nothing correctable can be found: ${JSON.stringify({
          consenterEmail, entity_id, affiliateEmail
        }, null, 2)}`);
        continue;
      }

      // Add the corrected single exhibit form to the bucket for the updated affiliate.
      const EF_S3ObjectKey = await new BucketExhibitForm({ 
        entityId:entity_id, itemType:ItemType.EXHIBIT, affiliateEmail, consenterEmail 
      }).correct(consenter);

      // Add the corrected disclosure form to the bucket for the updated affiliate.
      const DR_S3ObjectKey = await new BucketDisclosureForm({
         metadata: { entityId:entity_id, itemType:ItemType.DISCLOSURE, affiliateEmail, consenterEmail }     
      }).correct(consenter);

      successfulUpdates.push(updates[i]);

      // Reissue disclosure requests if already sent 
      await sendDisclosureRequestEmails({ EF_S3ObjectKey, DR_S3ObjectKey, affiliateEmail, reSend:true });
    }
  }

  // Handle new affiliates
  if(appends.length > 0) {
    const consenter = { email:consenterEmail, exhibit_forms:[ { entity_id, affiliates:appends } ] } as Consenter;
    for(let i=0; i<appends.length; i++) {
      // Send out an automatic disclosure request to the new affiliates (even though the AI did not get a 
      // chance to review them) and create the customary reminder event bridge rules.
      const { email:affiliateEmail } = appends[i];
      
      // Add a new single exhibit form to the bucket for the new affiliate.
      const EF_S3ObjectKey = await new BucketExhibitForm({ 
        entityId:entity_id, itemType:ItemType.EXHIBIT, affiliateEmail, consenterEmail 
      }).add(consenter);

      // Add a new disclosure form to the bucket for the new affiliate.
      const DR_S3ObjectKey = await new BucketDisclosureForm({
        metadata: { entityId:entity_id, itemType:ItemType.DISCLOSURE, affiliateEmail, consenterEmail }      
      }).add(consenter);

      // Reissue disclosure requests if already sent 
      await sendDisclosureRequestEmails( { EF_S3ObjectKey, DR_S3ObjectKey, affiliateEmail, reSend:true });
    }
  }

  // Handle all correction notification emails
  {
    corrections.deletes = successfulDeletes;
    corrections.updates = successfulUpdates;
    const correctionEmail = new ExhibitCorrectionEmail(consenterEmail, corrections);

    // Send an email to the entity reps about the affiliate updates, additions, and removals.
    await correctionEmail.sendToEntity();

    // Send an email to each affiliate that was updated notifiying them of the update.
    await correctionEmail.sendToAffiliates();
  }

  return getCorrectableAffiliates(consenterEmail, entity_id);
}


/**
 * RUN MANUALLY:
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/consenting-person/ConsentingPerson.ts')) {

  const task = Task.SEND_CONSENT as Task;
  
  const bugs = {
    affiliateType:"employer",
    email:"affiliate1@warhen.work",
    org:"Warner Bros.",
    fullname:"Bugs Bunny",
    title:"Rabbit",
    phone_number:"6172224444"
  };
  const daffy = {
    affiliateType:"academic",
    email:"affiliate2@warhen.work",
    org:"Cartoon Town University",
    fullname:"Daffy Duck",
    title:"Fowl",
    phone_number:"7813334444"
  };
  const sam = {
    affiliateType:"other",
    email:"affiliate3@warhen.work",
    org:"Anywhere Inc.",
    fullname:"Yosemite Sam",
    title:"Cowboy",
    phone_number:"5084448888"
  };

  let payload = { task } as any;

  (async () => {
    try {
      // 1) Get context variables
      const context:IContext = await require('../../../../contexts/context.json');
      const { STACK_ID, REGION, ACCOUNT, TAGS: { Landscape }} = context;
      const prefix = `${STACK_ID}-${Landscape}`;
  
      // 2) Get the cloudfront domain
      const cloudfrontDomain = await lookupCloudfrontDomain(Landscape);
      if( ! cloudfrontDomain) {
        throw('Cloudfront domain lookup failure');
      }
      process.env.CLOUDFRONT_DOMAIN = cloudfrontDomain;

      // 3) Get the userpool ID
      const userpoolId = await lookupUserPoolId(`${prefix}-cognito-userpool`, REGION);

      // 4) Get bucket name & lambda function arns
      const bucketName = `${prefix}-exhibit-forms`;
      const { ExhibitFormBucketPurge: s3DE, ExhibitFormDbPurge: dbDE, DisclosureRequestReminder:drDE} = DelayedExecutions
      const dbFunctionName = `${prefix}-${dbDE.coreName}`;
      const s3FunctionName = `${prefix}-${s3DE.coreName}`;
      const drFunctionName = `${prefix}-${drDE.coreName}`;

      // 5) Set environment variables
      process.env[dbDE.targetArnEnvVarName] = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${dbFunctionName}`;
      process.env[s3DE.targetArnEnvVarName] = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${s3FunctionName}`;
      process.env[drDE.targetArnEnvVarName] = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${drFunctionName}`
      process.env[ExhibitFormsBucketEnvironmentVariableName] = bucketName;
      process.env.USERPOOL_ID = userpoolId;
      process.env.PREFIX = prefix
      process.env.REGION = REGION;
      process.env.DEBUG = 'true';

      // 6) Define task-specific input
      switch(task) {
        case Task.SAVE_EXHIBIT_FORM:
          payload.parameters = { email: 'cp1@warhen.work', exhibit_data: { affiliates: [ bugs, daffy, sam ]} };      
          // Make some edits
          payload.parameters.exhibit_data.affiliates[0].email = 'bugsbunny@gmail.com';
          payload.parameters.exhibit_data.affiliates[1].org = 'New York School of Animation';
          payload.parameters.exhibit_data.affiliates[1].fullname = 'Daffy D Duck';
          break;

        case Task.SEND_EXHIBIT_FORM:
          // Create a reduced app config just for this test
          const { DELETE_EXHIBIT_FORMS_AFTER } = ConfigNames;
          const configs = { useDatabase: false, configs: [
            { name:DELETE_EXHIBIT_FORMS_AFTER, value:'120', config_type:'duration', description:'testing' }
          ]} as CONFIG;

          // Set the config as an environment variable
          process.env[Configurations.ENV_VAR_NAME] = JSON.stringify(configs);

          // Set the payload
          payload.parameters = {
            email: "cp1@warhen.work",
            exhibit_data: {
              entity_id: "3ef70b3e-456b-42e8-86b0-d8fbd0066628",
              affiliates: [
                {
                  affiliateType: "ACADEMIC",
                  email: "affiliate2@warhen.work",
                  org: "My Neighborhood University",
                  fullname: "Mister Rogers",
                  title: "Daytime child television host",
                  phone_number: "781-333-5555"
                },
                {
                  affiliateType: "OTHER",
                  email: "affiliate3@warhen.work",
                  org: "Thingamagig University",
                  fullname: "Elvis Presley",
                  title: "Entertainer",
                  phone_number: "508-333-9999"
                }
              ]
            }
          }
          break;

        case Task.CORRECT_EXHIBIT_FORM:
          const { ACADEMIC, OTHER } = AffiliateTypes;
          payload.parameters = {
            email: 'cp2@warhen.work',
            corrections: {
              entity_id: '13376a3d-12d8-40e1-8dee-8c3d099da1b2',
              appends: [
                {
                  affiliateType: OTHER,
                  email: 'affiliate6@warhen.work',
                  phone_number: '1237776666',
                  fullname: 'Sherlock Holmes',
                  org: 'Scotland Yard',
                  title: 'Detective'
                }
              ],
              updates: [
                {
                  affiliateType: ACADEMIC,
                  email: 'affiliate2@warhen.work',
                  fullname: 'Daffy Duck (correction 1)',
                  title: 'Duck (correction 1)',
                  org: 'Warner Bros. (correction 1)',
                  phone_number: '6172223456'
                }
              ],
              deletes: [
                "affiliate1@warhen.work"
              ]
            } as ExhibitFormCorrection
          }
          break;

        case Task.GET_CONSENTER:
        case Task.SEND_CONSENT:
          payload.parameters = { email: 'cp1@warhen.work' };
          break;
        case Task.RENEW_CONSENT:
          payload.parameters = { email: 'cp1@warhen.work' };
          break;
        case Task.RESCIND_CONSENT:
          payload.parameters = { email: 'cp1@warhen.work' };
          break;

        case Task.REGISTER_CONSENT:
          payload.parameters = {
            signature: "Yosemite Sam",
            fullname: "Yosemite S Sam",
            email: "cp1@warhen.work",
            phone: "+7812224444"
          };
          break;
      }

      // 7) Build the lambda event object
      let sub = '417bd590-f021-70f6-151f-310c0a83985c';
      let _event = {
        headers: { [AbstractRoleApi.ETTPayloadHeader]: JSON.stringify(payload) },
        requestContext: { authorizer: { claims: { username:sub, sub } } }
      } as any;

      // 8) Execute the lambda event handler to perform the task
      await handler(_event);
      log(`${task} complete.`);
    }
    catch(reason) {
      console.error(reason);
    }
  })();
}