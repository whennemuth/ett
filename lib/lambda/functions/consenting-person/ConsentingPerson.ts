import { DeleteObjectsCommandOutput } from "@aws-sdk/client-s3";
import { CONFIG, IContext } from "../../../../contexts/IContext";
import { DelayedExecutions } from "../../../DelayedExecution";
import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { lookupUserPoolId } from "../../_lib/cognito/Lookup";
import { CognitoStandardAttributes, UserAccount } from "../../_lib/cognito/UserAccount";
import { Configurations } from "../../_lib/config/Config";
import { ConsenterCrud, UserCrudParams } from "../../_lib/dao/dao-consenter";
import { AffiliateTypes, ConfigNames, Consenter, ConsenterFields, ExhibitForm, ExhibitFormConstraints, Roles, YN } from "../../_lib/dao/entity";
import { ConsentFormData } from "../../_lib/pdf/ConsentForm";
import { debugLog, error, errorResponse, invalidResponse, log, lookupCloudfrontDomain, okResponse } from "../../Utils";
import { deleteExhibitForm } from "../delayed-execution/PurgeExhibitFormFromDatabase";
import { BucketInventory } from "./BucketInventory";
import { ExhibitBucket } from "./BucketItemExhibitForms";
import { BucketItemMetadataParms, ExhibitFormsBucketEnvironmentVariableName } from "./BucketItemMetadata";
import { ConsentFormEmail } from "./ConsentEmail";
import { appendTimestamp, ConsenterInfo, getConsenterInfo, getConsenterResponse, getCorrectableAffiliates, sendForm } from "./ConsentingPersonUtils";
import { ConsentingPersonToCorrect } from "./correction/Correction";
import { correctExhibit, ExhibitFormCorrection } from "./ExhibitCorrect";
import { saveExhibit } from "./ExhibitSave";
import { ExhibitDataSender } from "./ExhibitSend";
import { IndividualRegistrationFormData, IndividualRegistrationFormEmail } from "./RegistrationEmail";

export enum Task {
  SAVE_EXHIBIT_FORM = 'save-exhibit-form',
  CORRECT_EXHIBIT_FORM = 'correct-exhibit-form',
  SEND_EXHIBIT_FORM = 'send-exhibit-form',
  GET_CONSENTER = 'get-consenter',
  GET_CONSENTER_FORMS = 'get-consenter-forms',
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
  expiredConsent: 'Your consent has expired. Please renew your consent before proceeding.',
  invalidAffiliateRecords: 'Affiliate item with missing/invalid value',
  inactiveConsenter: 'Consenter is inactive',
  noSuchConsenter: 'No such consenter',
  emailFailures: `There were one or more email failures related to exhibit form activty for INSERT_EMAIL. 
  Therefore removal of the corresponding data from the consenters database record is deferred until its natural expiration`
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
        case Task.GET_CONSENTER_FORMS:
          return await getConsenterForms(email);
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
          return await getCorrectableAffiliates(email, entity_id, true);
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

export const getConsenterForms = async (email:string): Promise<LambdaProxyIntegrationResponse> => {
  const inventory = await BucketInventory.getInstance(email);
  return okResponse('Ok', { inventory: inventory.toHierarchicalString() });
}

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

  const response = await appendTimestamp({
    consenter: consenterInfo.consenter, 
    timestampFldName: ConsenterFields.consented_timestamp,
    active: YN.Yes
  });
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
  //   if(consenterInfo?.consenter?.active != YN.Yes) {
  //     return invalidResponse(INVALID_RESPONSE_MESSAGES.inactiveConsenter);
  //   }
  //   return invalidResponse(INVALID_RESPONSE_MESSAGES.missingConsent);
  // }

  return appendTimestamp({
    consenter: consenterInfo.consenter, 
    timestampFldName: ConsenterFields.renewed_timestamp,
    active: YN.Yes
  });
}

/**
 * Rescind the consenting individuals consent.
 * @param email 
 * @returns 
 */
export const rescindConsent = async (email:string, totalDeletion:boolean=false): Promise<LambdaProxyIntegrationResponse> => {
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

  if(totalDeletion) {
    // Delete the consenter from the database.
    await ConsenterCrud({ consenterInfo: { email }} as UserCrudParams).Delete();
    
    // Delete all exhibit forms belonging to the consenter from the s3 bucket.
    const exhibitFormBucket = process.env[ExhibitFormsBucketEnvironmentVariableName];
    if(exhibitFormBucket) {
      const bucketItem = new ExhibitBucket({ email } as Consenter);
      const output:DeleteObjectsCommandOutput|void = await bucketItem.deleteAll({
        consenterEmail: email
      } as BucketItemMetadataParms);
      log(output, `Deleted exhibit forms from bucket for ${email}`);
    }
    else {
      error({ 
        consenter: email,
        envVarName: ExhibitFormsBucketEnvironmentVariableName,
      }, `Cannot delete exhibit forms from bucket - missing environment variable ${ExhibitFormsBucketEnvironmentVariableName}`);
    }
    return okResponse('Ok', { message: `Deleted consenter ${email} from the dynamodb, cognito, and s3` });
  }
  else {
    // Flip the consenter database record to inactive, remove the sub, and push the current timestamp to its rescinded array.
    return appendTimestamp({
      consenter, 
      timestampFldName: ConsenterFields.rescinded_timestamp,
      active: YN.No,
      removeSub: true
    });
  }
};

/**
 * TOTAL deletion of consenter: database record, cognito account, and any exhibit forms they may have in s3.
 * @param email 
 */
export const deleteConsenter = async (email:string): Promise<LambdaProxyIntegrationResponse> => {
  return rescindConsent(email, true);
}

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


/**
 * Send a pdf copy of the consent form to the consenter
 * @param email 
 * @returns 
 */
export const sendConsent = async (consenter:Consenter, entityName?:string): Promise<LambdaProxyIntegrationResponse> => {
  const email = consenter.email.toLowerCase();
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
export const sendConsenterRegistrationForm = async (consenterInfo:Consenter, entityName:string, loginHref?:string): Promise<LambdaProxyIntegrationResponse> => {
  const email = consenterInfo.email.toLowerCase();;
  const consenter = await ConsenterCrud({ consenterInfo }).read() as Consenter;
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
  return saveExhibit(email, exhibitForm);
};



/**
 * Send full exhibit form to each authorized individual of the entity, remove it from the database, and save
 * each constituent single exhibit form to s3 for temporary storage.
 * @param consenterEmail 
 * @param exhibitForm 
 * @returns 
 */
export const sendExhibitData = async (consenterEmail:string, exhibitForm:ExhibitForm): Promise<LambdaProxyIntegrationResponse> => {
  return new ExhibitDataSender(consenterEmail, exhibitForm).send();
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
  return correctExhibit(consenterEmail, corrections);
}


/**
 * RUN MANUALLY:
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/consenting-person/ConsentingPerson.ts')) {

  const task = Task.GET_CONSENTER as Task;
  
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
          // Set the config as an environment variable
          process.env[Configurations.ENV_VAR_NAME] = JSON.stringify({ useDatabase:false, configs: [{
            name:ConfigNames.DELETE_EXHIBIT_FORMS_AFTER, value:'120', config_type:'duration', description:'testing'
          }]} as CONFIG);

          // Set the payload
          payload.parameters = {
            email: "cp1@warhen.work",
            exhibit_data: {
              entity_id: "9ea1b3d3-729b-4c51-b0d0-51000b19be4e",
              constraint: ExhibitFormConstraints.BOTH,
              affiliates: [
                {
                  affiliateType: AffiliateTypes.EMPLOYER,
                  email: "affiliate2@warhen.work",
                  org: "My Neighborhood University",
                  fullname: "Mister Rogers",
                  title: "Daytime child television host",
                  phone_number: "781-333-5555"
                },
                // {
                //   affiliateType: "OTHER",
                //   email: "affiliate3@warhen.work",
                //   org: "Thingamagig University",
                //   fullname: "Elvis Presley",
                //   title: "Entertainer",
                //   phone_number: "508-333-9999"
                // }
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
          // Set the config consent expiration environment variable
          process.env[Configurations.ENV_VAR_NAME] = JSON.stringify({ useDatabase:false, configs: [{
            name:ConfigNames.CONSENT_EXPIRATION, value:'315360000', config_type:'duration', description:'testing'
          }]} as CONFIG);          
          payload.parameters = { email: 'cp2@warhen.work' };
          break;
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