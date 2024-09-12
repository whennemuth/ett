import { IContext } from "../../../../contexts/IContext";
import { DISCLOSURE_REQUEST_REMINDER, EXHIBIT_FORM_DB_PURGE } from "../../../DelayedExecution";
import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { lookupUserPoolId } from "../../_lib/cognito/Lookup";
import { Configurations } from "../../_lib/config/Config";
import { DAOFactory } from "../../_lib/dao/dao";
import { ConsenterCrud } from "../../_lib/dao/dao-consenter";
import { ENTITY_WAITING_ROOM } from "../../_lib/dao/dao-entity";
import { Affiliate, AffiliateTypes, ConfigName, ConfigNames, Consenter, ConsenterFields, Entity, ExhibitForm, Roles, User, YN } from "../../_lib/dao/entity";
import { ConsentFormData } from "../../_lib/pdf/ConsentForm";
import { PdfForm } from "../../_lib/pdf/PdfForm";
import { DelayedLambdaExecution } from "../../_lib/timer/DelayedExecution";
import { EggTimer, PeriodType } from "../../_lib/timer/EggTimer";
import { ComparableDate, debugLog, deepClone, errorResponse, invalidResponse, log, lookupCloudfrontDomain, okResponse } from "../../Utils";
import { ConsentFormEmail } from "./ConsentEmail";
import { ExhibitBucket } from "./BucketExhibitForms";
import { ExhibitEmail, FormTypes } from "./ExhibitEmail";
import { DisclosureFormBucket } from "./BucketDisclosureForms";
import { BucketItemMetadataParms, ItemType } from "./BucketItemMetadata";
import { BucketItem } from "./BucketItem";
import { DisclosureRequestReminderLambdaParms } from "../delayed-execution/SendDisclosureRequestReminder";
import { DisclosureEmailParms } from "../authorized-individual/DisclosureRequestEmail";

export enum Task {
  SAVE_EXHIBIT_FORM = 'save-exhibit-form',
  CORRECT_EXHIBIT_FORM = 'correct-exhibit-form',
  SEND_EXHIBIT_FORM = 'send-exhibit-form',
  GET_CONSENTER = 'get-consenter',
  REGISTER_CONSENT = 'register-consent',
  RENEW_CONSENT = 'renew-consent',
  RESCIND_CONSENT = 'rescind-consent',
  SEND_CONSENT = 'send-consent',
  CORRECT_CONSENT = 'correct-consent',
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
      const { email, exhibit_data:exhibitForm, entityName } = parameters;
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
        case Task.CORRECT_CONSENT:
          return await correctConsent(parameters);
        case Task.SAVE_EXHIBIT_FORM:
          return await saveExhibitData(email, exhibitForm);
        case Task.SEND_EXHIBIT_FORM:
          return await sendExhibitData(email, exhibitForm);
        case Task.CORRECT_EXHIBIT_FORM:
          return await correctExhibitData(email, exhibitForm);
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
 * @param email 
 * @returns 
 */
export const getConsenterResponse = async (email:string, includeEntityList:boolean=true): Promise<LambdaProxyIntegrationResponse> => {
  if( ! email) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingEmail)
  }
  const consenterInfo = await getConsenter(email, includeEntityList);
  if( ! consenterInfo) {
    return okResponse(`No such consenter: ${email}`);
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
  let activeConsent:boolean = false;
  if(consented_timestamp && `${active}` == YN.Yes) {

    const consented = ComparableDate(consented_timestamp);
    const rescinded = ComparableDate(rescinded_timestamp);
    const renewed = ComparableDate(renewed_timestamp);

    if(consented.after(rescinded) && consented.after(renewed)) {
      activeConsent = true; // Consent was given
    }
    if(renewed.after(consented) && renewed.after(rescinded)) {
      activeConsent = true; // Consent was rescinded but later restored
    }
    if(rescinded.after(consented) && rescinded.after(renewed)) {
      activeConsent = false; // Consent was rescinded
    }
  }
  return activeConsent;
}

/**
 * Get a consenters database record.
 * @param email 
 * @returns 
 */
export const getConsenter = async (email:string, includeEntityList:boolean=true): Promise<ConsenterInfo|null> => {
  const dao = DAOFactory.getInstance({ DAOType: 'consenter', Payload: { email } as Consenter });
  const consenter = await dao.read({ convertDates: false }) as Consenter;
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
  debugLog(`Returning: ${JSON.stringify(retval, null, 2)}`);

  return retval;
}

/**
 * Change one of the timestamp fields of the consenter.
 * @param email 
 * @param timestampFld 
 * @returns 
 */
export const changeTimestamp = async (email:string, timestampFld:string): Promise<LambdaProxyIntegrationResponse> => {
  if( ! email) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingEmail)
  }
  const dao = DAOFactory.getInstance({ DAOType: 'consenter', Payload: { 
    email, 
    [ timestampFld ]: new Date().toISOString() 
  } as Consenter });

  await dao.update();
  
  return getConsenterResponse(email, false);
};

/**
 * Register consent by applying a consented_timestamp value to the consenter database record.
 * @param email 
 * @returns 
 */
export const registerConsent = async (email:string): Promise<LambdaProxyIntegrationResponse> => {
  console.log(`Registering consent for ${email}`);
  const response = await changeTimestamp(email, ConsenterFields.consented_timestamp);
  const consenterInfo = JSON.parse(response.body ?? '{}')['payload'] as ConsenterInfo;
  const { consenter } = consenterInfo ?? {};
  if(consenter) {
    // TODO: Mention of a specific entity in the consent form is in question and needs to be resolved with the client.
    await sendConsent(consenter, 'unknown entity');
  }
  return response;
}

/**
 * Renew consent by applying a renewed_timestamp value to the consenter database record.
 * @param email 
 * @returns 
 */
export const renewConsent = async (email:string): Promise<LambdaProxyIntegrationResponse> => {
  console.log(`Renewing consent for ${email}`);
  return changeTimestamp(email, ConsenterFields.renewed_timestamp);
}

/**
 * Rescind consent by applying a rescinded_timestamp value to the consenter database record.
 * @param email 
 * @returns 
 */
export const rescindConsent = async (email:string): Promise<LambdaProxyIntegrationResponse> => {
  console.log(`Rescinding consent for ${email}`);
  return changeTimestamp(email, ConsenterFields.rescinded_timestamp);
};

/**
 * Correct consent. NOT IMPLEMENTED - pending dialog with client 
 * @param parameters 
 * @returns 
 */
export const correctConsent = async (parameters:any): Promise<LambdaProxyIntegrationResponse> => {
  const { email, alt_email, full_name, phone_number, signature } = parameters;
  console.log(`NOT IMPLEMENTED: Correct consent for: ${JSON.stringify(parameters, null, 2)}`);
  return getConsenterResponse(email, false);
};

/**
 * Send a pdf copy of the consent form to the consenter
 * @param email 
 * @returns 
 */
export const sendConsent = async (consenter:Consenter, entityName:string): Promise<LambdaProxyIntegrationResponse> => {
  const { email } = consenter;
  console.log(`Sending consent form to ${email}`);
  let consenterInfo:ConsenterInfo|null;
  if(email && Object.keys(consenter).length == 1) {
    // email was the only piece of information provided about the consenter, so retrieve the rest from the database.
    consenterInfo = await getConsenter(email, false) as ConsenterInfo;
    if(consenterInfo) {
      const { consenter: { firstname, middlename, lastname}} = consenterInfo ?? { consenter: {}};
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

  await new ConsentFormEmail({ consenter:consenterInfo.consenter, entityName } as ConsentFormData).send(email);
  return okResponse('Ok', consenterInfo);
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
  const consenterInfo = await getConsenter(email, false) as ConsenterInfo;
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
      console.log(`Warning: Illegal state - existing exhibit form found without create_timestamp! ${info}`);
    }
    if(exhibitForm.create_timestamp) {
      if(exhibitForm.create_timestamp != (existingTimestamp || exhibitForm.create_timestamp)) {
        console.log(`Warning: Updates to exhibit form create_timestamp are disallowed:  ${info}`);
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
  const { EXHIBIT_FORM_DATABASE_PURGE_FUNCTION_ARN:functionArn } = process.env;
  if(functionArn) {
    const lambdaInput = { consenterEmail: newConsenter.email, entity_id: exhibitForm.entity_id };
    const delayedTestExecution = new DelayedLambdaExecution(functionArn, lambdaInput);
    const configs = new Configurations();
    const { SECONDS } = PeriodType;
    const waitTime = (await configs.getAppConfig(ConfigNames.DELETE_DRAFTS_AFTER)).getDuration();
    if(waitTime > 0) {
      const timer = EggTimer.getInstanceSetFor(waitTime, SECONDS); 
      await delayedTestExecution.startCountdown(timer);
      console.log(`Purge of exhibit form from database scheduled for: ${timer.getCronExpression()}`);
    }
    else {
      console.log(`Purge of exhibit form from database NOT SCHEDULED (the corresponding cron has been deactivated)`);
    }
  }
  else {
    console.error('Cannot schedule exhibit form purge from database: functionArn variable is missing from the environment!');
  }

  return getConsenterResponse(email, true);
};

/**
 * Send full exhibit form to each authorized individual of the entity, remove it from the database, and save
 * each constituent single exhibit form to s3 for temporary storage.
 * @param exhibitForm 
 * @returns 
 */
export const sendExhibitData = async (email:string, exhibitForm:ExhibitForm): Promise<LambdaProxyIntegrationResponse> => {
  
  const affiliates = [] as Affiliate[];
  const emailFailuresForEntityStaff = [] as string[];
  const emailFailuresForAffiliates = [] as string[];
  const emailFailures = () => { return emailFailuresForEntityStaff.length > 0 || emailFailuresForAffiliates.length > 0; }
  let badResponse:LambdaProxyIntegrationResponse|undefined;
  let entity_id:string|undefined;
  let consenter = {} as Consenter;
  let entity = {} as Entity;
  let users = [] as User[];

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
    if( ! email) {
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
    const consenterInfo = await getConsenter(email, false) as ConsenterInfo;
    const { consenter: _consenter, activeConsent } = consenterInfo ?? {};

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
    users.push(..._users);
  }

  /**
   * Save the single exhibit form excerpts of the full exhibit form to the s3 bucket.
   */
  const transferSingleExhibitFormsToBucket = async () => {
    emailFailuresForAffiliates.length = 0;
    const now = new Date();
    const { EXHIBIT, DISCLOSURE } = ItemType;
    for(let i=0; i<affiliates.length; i++) {
      const parms = { 
        entityId:entity.entity_id, 
        affiliateEmail:affiliates[i].email,
        savedDate: now
      } as BucketItemMetadataParms;

      // 1) Save a copy of the single exhibit form pdf to the s3 bucket
      parms.itemType = EXHIBIT;
      const exhibitsBucket = new ExhibitBucket(new BucketItem(consenter));
      const s3ObjectKeyForExhibitForm = await exhibitsBucket.add(parms);

      // 2) Save a copy of the disclosure form to the s3 bucket
      parms.itemType = DISCLOSURE;
      const disclosuresBucket = new DisclosureFormBucket(new BucketItem(consenter));
      const s3ObjectKeyForDisclosureForm = await disclosuresBucket.add(parms);

      // 3) Schedule database purging actions for the forms that were just saved to the bucket.
      // Perhaps combine as a pair into one rule?
    }
  }

  
  /**
   * Send the full exhibit form to each authorized individual and the RE admin.
   */
  const sendFullExhibitFormToEntityStaff = async () => {
    emailFailuresForEntityStaff.length = 0;
    for(let i=0; i<users.length; i++) {
      var sent:boolean = await new ExhibitEmail(exhibitForm, FormTypes.FULL, entity, consenter).send(users[i].email);
      if( ! sent) {
        emailFailuresForEntityStaff.push(users[i].email);
      }
    }
  }

  /**
   * Prune a full exhibit form from the consenters database record
   */
  const pruneExhibitFormFromDatabaseRecord = async () => {
    if(emailFailures()) {
      console.log(`There were email failures related to exhibit form activty for ${consenter.email}. 
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

  const cancelEventBridgeDatabasePruningRule = async () => {
    if(emailFailures()) {
      return;
    }
    // TODO: Write the code for this
    // NOTE: It may be worth simply letting the rule remain so that it triggers the lambda function, 
    // which, although performing a non-action (db content to delete is already deleted), will 
    // ultimately result in the rule deletion anyway as a final cleanup action.
    return;
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
      failedEmails.push(...emailFailuresForAffiliates);
      const payload = { failedEmails };
      return errorResponse(msg, payload);
    }
    return getConsenterResponse(email, true);
  }

  try {

    validatePayload();

    await loadInfoFromDatabase();
    
    await sendFullExhibitFormToEntityStaff();
    
    await transferSingleExhibitFormsToBucket();

    await pruneExhibitFormFromDatabaseRecord();

    await cancelEventBridgeDatabasePruningRule();

    return getResponse(email, true);
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
 * Send corrected single exhibit form to each authorized individual of the entity.
 * @param email 
 * @param exhibitForm 
 * @returns 
 */
export const correctExhibitData = async (email:string, exhibitForm:ExhibitForm): Promise<LambdaProxyIntegrationResponse> => {

  return okResponse('Ok');
}


/**
 * RUN MANUALLY:
 */
const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_CONSENTING_PERSON') {

  const task = Task.SEND_EXHIBIT_FORM as Task;
  let payload = {
    task,
    parameters: {
      email:"cp1@warhen.work",
      exhibit_data: {
        entity_id:"8ea27b83-1e13-40b0-9192-8f2ce6a5817d",
        affiliates: [
          {
            affiliateType:"employer",
            email:"affiliate1@warhen.work",
            org:"Warner Bros.",
            fullname:"Bugs Bunny",
            title:"Rabbit",
            phone_number:"6172224444"
          },{
            affiliateType:"academic",
            email:"affiliate2@warhen.work",
            org:"Cartoon Town University",
            fullname:"Daffy Duck",
            title:"Fowl",
            phone_number:"7813334444"
          },{
            affiliateType:"other",
            email:"affiliate3@warhen.work",
            org:"Anywhere Inc.",
            fullname:"Yosemite Sam",
            title:"Cowboy",
            phone_number:"5084448888"
          }
        ]
      }
    } 
  } as any;

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

      // 4) Set environment variables
      const bucketName = `${prefix}-exhibit-forms`;
      process.env.EXHIBIT_FORMS_BUCKET_NAME = bucketName;
      process.env.USERPOOL_ID = userpoolId;
      process.env.REGION = REGION;
      process.env.DEBUG = 'true';

      // 5) Define task-specific input
      switch(task) {
        case Task.SAVE_EXHIBIT_FORM:
          const prefix = `${STACK_ID}-${Landscape}`
          const functionName = `${prefix}-${EXHIBIT_FORM_DB_PURGE}`;
          process.env.EXHIBIT_FORM_DATABASE_PURGE_FUNCTION_ARN = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${functionName}`;
          // Make some edits
          payload.parameters.exhibit_data.affiliates[0].email = 'bugsbunny@gmail.com';
          payload.parameters.exhibit_data.affiliates[1].org = 'New York School of Animation';
          payload.parameters.exhibit_data.affiliates[1].fullname = 'Daffy D Duck';
          break;
        case Task.SEND_EXHIBIT_FORM:
          payload = {
            "task": "send-exhibit-form",
            "parameters": {
              "email": "cp1@warhen.work",
              "exhibit_data": {
                "entity_id": "3ef70b3e-456b-42e8-86b0-d8fbd0066628",
                "affiliates": [
                  {
                    "affiliateType": "ACADEMIC",
                    "email": "affiliate2@warhen.work",
                    "org": "My Neighborhood University",
                    "fullname": "Mister Rogers",
                    "title": "Daytime child television host",
                    "phone_number": "781-333-5555"
                  },
                  {
                    "affiliateType": "OTHER",
                    "email": "affiliate3@warhen.work",
                    "org": "Thingamagig University",
                    "fullname": "Elvis Presley",
                    "title": "Entertainer",
                    "phone_number": "508-333-9999"
                  }
                ]
              }
            }
          }
          break;
        case Task.GET_CONSENTER:
        case Task.SEND_CONSENT:
        case Task.RENEW_CONSENT:
        case Task.RESCIND_CONSENT:
          payload = { task, parameters: { email: 'cp1@warhen.work' } };
          break;
        case Task.REGISTER_CONSENT:
          payload = {
            task,
            parameters: {
              signature: "Yosemite Sam",
              fullname: "Yosemite S Sam",
              email: "cp1@warhen.work",
              phone: "+7812224444"
            }
          };
          break;
      }

      // 6) Build the lambda event object
      let sub = '417bd590-f021-70f6-151f-310c0a83985c';
      let _event = {
        headers: { [AbstractRoleApi.ETTPayloadHeader]: JSON.stringify(payload) },
        requestContext: { authorizer: { claims: { username:sub, sub } } }
      } as any;

      // 7) Execute the lambda event handler to perform the task
      await handler(_event);
      console.log(`${task} complete.`);
    }
    catch(reason) {
      console.error(reason);
    }
  })();
}