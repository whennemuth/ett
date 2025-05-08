import { CONFIG, IContext } from "../../../../contexts/IContext";
import { DelayedExecutions } from "../../../DelayedExecution";
import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { lookupUserPoolId } from "../../_lib/cognito/Lookup";
import { Configurations } from "../../_lib/config/Config";
import { ConfigNames, Role, Roles, User } from "../../_lib/dao/entity";
import { InvitablePerson, InvitablePersonParms } from "../../_lib/invitation/InvitablePerson";
import { SignupLink } from "../../_lib/invitation/SignupLink";
import { debugLog, errorResponse, invalidResponse, log, lookupCloudfrontDomain, okResponse } from "../../Utils";
import { sendEntityRegistrationForm } from "../cognito/PostSignup";
import { ExhibitFormsBucketEnvironmentVariableName } from "../consenting-person/BucketItemMetadata";
import { getConsenterList } from "../consenting-person/ConsentingPersonUtils";
import { correctUser, lookupEntity, retractInvitation } from "../re-admin/ReAdminUser";
import { amendEntityName, amendEntityUser, handleRegistrationAmendmentCompletion } from "./AmendEntity";
import { demolishEntity } from "./DemolishEntity";
import { sendDisclosureRequests } from "./DisclosureRequest";
import { ExhibitFormRequest, SendExhibitFormRequestParms } from "./ExhibitFormRequest";

export enum Task {
  LOOKUP_USER_CONTEXT = 'lookup-user-context',
  DEMOLISH_ENTITY = 'demolish-entity',
  SEND_DISCLOSURE_REQUEST = 'send-disclosure-request',
  SEND_EXHIBIT_FORM_REQUEST = 'send-exhibit-form-request',
  GET_CONSENTERS = 'get-consenter-list',
  AMEND_ENTITY_NAME = 'amend-entity-name',  
  AMEND_ENTITY_USER = 'amend-entity-user',
  AMEND_REGISTRATION_COMPLETE = 'amend-registration-complete',  
  INVITE_USER = 'invite-user',
  RETRACT_INVITATION = 'retract-invitation',
  SEND_REGISTRATION = 'send-registration',
  CORRECTION = 'correct-entity-rep',
  PING = 'ping'
};

/**
 * This function performs all actions a RE_AUTH_IND can take to accomplish their role in the system.
 * @param event 
 * @returns LambdaProxyIntegrationResponse
 */
export const handler = async (event:any):Promise<LambdaProxyIntegrationResponse> => {
  try {

    debugLog(event);
    
    const payloadJson = event.headers[AbstractRoleApi.ETTPayloadHeader];
    const payload = payloadJson ? JSON.parse(payloadJson) as IncomingPayload : null;
    let { task, parameters } = payload || {};

    if( ! Object.values<string>(Task).includes(task || '')) {
      return invalidResponse(`Bad Request: Invalid/Missing task parameter: ${task}`);
    }
    else if( ! parameters) {
      return invalidResponse(`Bad Request: Missing parameters parameter for ${task}`);
    }
    else {
      log(`Performing task: ${task}`);
      const callerUsername = event?.requestContext?.authorizer?.claims?.username;
      const callerSub = callerUsername || event?.requestContext?.authorizer?.claims?.sub;
      switch(task as Task) {

        case Task.LOOKUP_USER_CONTEXT:
          var { email, role } = parameters;
          return await lookupEntity(email, role);
          
        case Task.DEMOLISH_ENTITY:
          var { entity_id, dryRun=false, notify=true } = parameters;
          return await demolishEntity(entity_id, notify, dryRun);

        case Task.SEND_EXHIBIT_FORM_REQUEST:
          var { consenterEmail, entity_id, constraint, linkUri, lookback, positions } = parameters;
          return await new ExhibitFormRequest( { 
            consenterEmail, entity_id, constraint, linkUri, lookback, positions
          } as SendExhibitFormRequestParms).sendEmail();

        case Task.SEND_DISCLOSURE_REQUEST:
          var { consenterEmail, entity_id, affiliateEmail=undefined } = parameters;
          return await sendDisclosureRequests(consenterEmail, entity_id, [ affiliateEmail ].filter(a => a));
            
        case Task.GET_CONSENTERS:
          var { fragment } = parameters;
          return await getConsenterList(fragment);

        case Task.AMEND_ENTITY_NAME:
          var { entity_id, name } = parameters;
          return await amendEntityName(entity_id, name, callerSub);

        case Task.AMEND_ENTITY_USER:
          return await amendEntityUser(parameters);

        case Task.AMEND_REGISTRATION_COMPLETE:
          var { amenderEmail, entity_id } = parameters;
          return await handleRegistrationAmendmentCompletion(amenderEmail, entity_id);

        case Task.INVITE_USER:
          var { email, entity_id, role, registrationUri } = parameters;
          var user = { email, entity_id, role } as User;
          const invitablePerson = new InvitablePerson({ invitee:user, inviterRole:Roles.RE_AUTH_IND, 
            linkGenerator: async (entity_id:string, role?:Role) => {
              return await new SignupLink().getRegistrationLink({ email, entity_id, registrationUri });
            }, inviterCognitoUserName:callerSub
          } as InvitablePersonParms);
          return await invitablePerson.invite();
           
        case Task.SEND_REGISTRATION:
          var { email, role, termsHref, dashboardHref, privacyHref } = parameters;
          return await sendEntityRegistrationForm( { email, role, termsHref, dashboardHref, privacyHref });
             
        case Task.RETRACT_INVITATION:
          return await retractInvitation(parameters.code);

        case Task.CORRECTION:
          return await correctUser(parameters);
          
        case Task.PING:
          return okResponse('Ping!', parameters);
      } 
    }
  }
  catch(e:any) {
    log(e);
    return errorResponse(`Internal server error: ${e.message}`);
  }
}





/**
 * RUN MANUALLY: Modify the task, landscape, entity_id, and dryRun settings as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/authorized-individual/AuthorizedIndividual.ts')) {

  const task:Task = Task.AMEND_ENTITY_NAME;
  const { DisclosureRequestReminder, HandleStaleEntityVacancy } = DelayedExecutions;

  (async () => {
    // 1) Get context variables
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, REGION, ACCOUNT, TAGS: { Landscape }} = context;
    const prefix = `${STACK_ID}-${Landscape}`;

    // 2) Get the cloudfront domain
    const cloudfrontDomain = await lookupCloudfrontDomain(Landscape);
    if( ! cloudfrontDomain) {
      throw('Cloudfront domain lookup failure');
    }

    // 3) Get the userpool ID
    const userpoolId = await lookupUserPoolId(`${prefix}-cognito-userpool`, REGION);

    // 4) Get bucket name & lambda function arns
    const bucketName = `${prefix}-exhibit-forms`;
    const discFuncName = `${prefix}-${DisclosureRequestReminder.coreName}`;
    const staleFuncName = `${prefix}-${HandleStaleEntityVacancy.coreName}`;

    // 5) Set environment variables
    process.env[DisclosureRequestReminder.targetArnEnvVarName] = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${discFuncName}`;
    process.env[HandleStaleEntityVacancy.targetArnEnvVarName] = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${staleFuncName}`;
    process.env[ExhibitFormsBucketEnvironmentVariableName] = bucketName;
    process.env.PREFIX = prefix
    process.env.CLOUDFRONT_DOMAIN = cloudfrontDomain;
    process.env.USERPOOL_ID = userpoolId;
    process.env.REGION = REGION;

    let _event = {
      headers: {},
      requestContext: {
        authorizer: {
          claims: {
            username: '21ebc5b0-d0c1-7012-2d88-7ca56d0d7394',
            sub: '21ebc5b0-d0c1-7012-2d88-7ca56d0d7394'
          }
        }
      }
    } as any;

    switch(task as Task) {
      case Task.LOOKUP_USER_CONTEXT:
        log('NOT IMPLEMENTED');
        break;

      case Task.DEMOLISH_ENTITY:
        // Define the payload to go in the event object
        _event.headers[AbstractRoleApi.ETTPayloadHeader] = JSON.stringify({ task, parameters: { 
          entity_id: 'db542060-7de0-4c55-be58-adc92671d63a', 
          dryRun:true 
        }} as IncomingPayload);        
        break;

      case Task.SEND_DISCLOSURE_REQUEST:
        // Create a reduced app config just for this test
        const { FIRST_REMINDER, SECOND_REMINDER } = ConfigNames;
        const configs = { useDatabase:false, configs: [
          { name: FIRST_REMINDER, value: '180', config_type: 'duration', description: 'testing' },
          { name: SECOND_REMINDER, value: '240', config_type: 'duration', description: 'testing' },
        ]} as CONFIG;
        
        // Set the config as an environment variable
        process.env[Configurations.ENV_VAR_NAME] = JSON.stringify(configs);

        // Define the payload to go in the event object
        _event.headers[AbstractRoleApi.ETTPayloadHeader] = JSON.stringify({ task, parameters: {
          consenterEmail: "cp2@warhen.work",
          entity_id: "923e4db2-389f-4b30-86d3-9513e4211eaf",
          affiliateEmail: "affiliate1@warhen.work"
        }} as IncomingPayload);
        break;

      case Task.GET_CONSENTERS:
        const fragment = 'dd' as string | undefined;
        _event.headers[AbstractRoleApi.ETTPayloadHeader] = JSON.stringify({ task, parameters: {
          fragment
        }} as IncomingPayload);
        break;

      case Task.INVITE_USER:
        _event.headers[AbstractRoleApi.ETTPayloadHeader] = JSON.stringify({
          task,
          parameters:{
            entity_id:"2c0c4086-1bc0-4876-b7db-ed4244b16a6b",
            email:"asp1.random.edu@warhen.work",
            role:"RE_AUTH_IND",
            registrationUri:`https://${cloudfrontDomain}/bootstrap/index.htm`
        }});
        break;

      case Task.SEND_EXHIBIT_FORM_REQUEST:
        _event.headers[AbstractRoleApi.ETTPayloadHeader] = JSON.stringify({
          task,
          parameters: {
            consenterEmail: "cp1@warhen.work",
            entity_id: "7935cf3b-714c-4d99-a926-626355030981",
            constraint: "both",
            linkUri: "https://d227na12o3l3dd.cloudfront.net/bootstrap/index.htm",
            filename: "index.htm"
          }
        });
        break;

      case Task.AMEND_ENTITY_NAME:
        _event.headers[AbstractRoleApi.ETTPayloadHeader] = JSON.stringify({
          task,
          parameters: {
            entity_id: "10d68819-d795-478e-9436-f7423a104d5c",
            name: "The School of Rock (Amended 1)"
          }
        });
        break;

      case Task.PING:
        log('NOT IMPLEMENTED');
        break;

      default:
        log('MISSING/INVALID TASK');
        break;
    }

    try {
      const response = await handler(_event) as LambdaProxyIntegrationResponse;
      log(response);
    }
    catch(e) {
      log(e);
    }  
  })();
}
