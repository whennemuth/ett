import { IContext } from "../../../../contexts/IContext";
import { LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { DAOFactory } from "../../_lib/dao/dao";
import { ENTITY_WAITING_ROOM } from "../../_lib/dao/dao-entity";
import { Entity, Invitation, Roles, User, YN } from "../../_lib/dao/entity";
import { Registration } from "../../_lib/invitation/Registration";
import { debugLog, error, errorResponse, invalidResponse, log, lookupCloudfrontDomain, lookupSingleActiveEntity, okResponse, unauthorizedResponse } from "../../Utils";
import { demolishEntity } from "../authorized-individual/AuthorizedIndividual";

export enum Task {
  LOOKUP_INVITATION = 'lookup-invitation',
  LOOKUP_ENTITY = 'lookup-entity',
  REGISTER = 'register',
  TERMINATE = 'terminate'
}

/**
 * This handler is for the entity registration lambda function which takes all api calls related to activity that 
 * happens on the second screen of registration for RE_ADMIN and AUTH_IND users.
 * @param event 
 * @returns 
 */
export const handler = async(event:any):Promise<LambdaProxyIntegrationResponse> => {

  try {
    debugLog(event);
    
    const { task, 'invitation-code':code } = event.pathParameters;

    if( ! task ) {
      return invalidResponse(`Bad Request: task not specified (${Object.values(Task).join('|')})`);
    }
    if( ! Object.values<string>(Task).includes(task || '')) {
      return invalidResponse(`Bad Request: invalid task specified (${Object.values(Task).join('|')})`);
    }
    if( ! code ) {
      return unauthorizedResponse('Unauthorized: Invitation code missing');
    }

    const registration = new Registration(code);

    const invitation = await registration.getInvitation() as Invitation;

    if( invitation == null) {
      return unauthorizedResponse(`Unauthorized: Unknown invitation code ${code}`);
    }

    const { entity_id, role } = invitation;

    switch(task) {

      // Just want the invitation, probably to know its acknowledge and registration statuses.
      case Task.LOOKUP_INVITATION:
        return okResponse('Ok', invitation);

      // Return a list of users who have already gone through the registration process for the entity and exist in the users table.
      case Task.LOOKUP_ENTITY:
        const dao = DAOFactory.getInstance({
          DAOType: "user",
          Payload: { entity_id } as User
        })
        let users = await dao.read() as User[];
        // Filter off inactive users.
        users = users.filter((user) => { return user.active == YN.Yes; });
        let entity;
        if(entity_id != ENTITY_WAITING_ROOM) {
          entity = await lookupSingleActiveEntity(entity_id);
          if( ! entity) {
            return invalidResponse(`Invitation ${invitation.code} references an unknown entity: ${invitation.entity_id}`);
          }
        }
        return okResponse('Ok', { entity:(entity||null), users, invitation });

      // Officially set the invitation as registered, replace its dummy email with the true value, and set its fullname, title, and entity_name.
      // The PostSignup trigger lambda will come by later and "scrape" these out of the invitation for its own needs.
      case Task.REGISTER:
        if( ! event.queryStringParameters) {
          return invalidResponse('Bad Request: Missing querystring parameters');
        }
        let { email, fullname, title, entity_name } = event.queryStringParameters;

        if( ! email) {
          return invalidResponse('Bad Request: Missing email querystring parameter');
        }
        if( ! fullname) {
          return invalidResponse('Bad Request: Missing fullname querystring parameter');
        }
        if( ! entity_name && (role == Roles.RE_ADMIN || role == Roles.SYS_ADMIN) ) {
           return invalidResponse('Bad Request: Missing entity_name querystring parameter');
        }

        email = decodeURIComponent(email);
        fullname = decodeURIComponent(fullname);        
        if(entity_name) {
          entity_name = decodeURIComponent(entity_name);
        }
        if(title) {
          title = decodeURIComponent(title);
        }
        
        const { acknowledged_timestamp, registered_timestamp } = invitation;
        if( ! acknowledged_timestamp) {
          return unauthorizedResponse('Unauthorized: Privacy policy has not yet been acknowledged');
        }
        if(registered_timestamp) {
          return okResponse(`Ok: Already registered at ${registered_timestamp}`);
        }
        if(role == Roles.RE_ADMIN) {
          if( await registration.entityNameAlreadyInUse(entity_name)) {
            return invalidResponse(`Bad Request: The specified name: "${entity_name}", is already in use.`)
          }
        }
        if( await registration.registerUser({ email, fullname, title, entity_name } as Invitation)) {
          return okResponse(`Ok: Registration completed for ${code}`);
        }

        return errorResponse('Error: Registration failed!');

      // This is the "nuclear option" - demolish the entire entity (users, invitations, entity, related cognito items)
      case Task.TERMINATE:
        
        // Demolish the entity
        let { notify=true } = event.queryStringParameters || {};
        return demolishEntity(entity_id, notify);
    }

    // Should never get here:
    throw new Error('Error: Unreachable code');
  }
  catch(e:any) {
    error(e);
    return errorResponse(e.message);
  }
}


/**
 * RUN MANUALLY: Modify the task, landscape, region, invitation-code, and queryStringParameters as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/signup/EntityRegistration.ts')) {
  
  const task = Task.LOOKUP_ENTITY as Task;
  const invitation_code = 'ea14dcfd-2f5a-40e1-9bc1-48a3afeec996';

  (async () => {
    const context:IContext = await require('../../../../contexts/context.json');
    const { TAGS: { Landscape }, REGION } = context;

    const cloudfrontDomain = await lookupCloudfrontDomain(Landscape);

    process.env.CLOUDFRONT_DOMAIN = cloudfrontDomain;
    process.env.REGION = REGION;

    const pathParameters = {
      task,
      ['invitation-code']: invitation_code
    };

    let _event = {};
    switch(task) {
      case Task.LOOKUP_INVITATION:
        _event = { pathParameters };
        break;
      case Task.LOOKUP_ENTITY:
        _event = { pathParameters };
        break;
      case Task.REGISTER:
        _event = {
          pathParameters,
          queryStringParameters: {
            email: "wrh@bu.edu",
            fullname: "Warren Hennemuth",
            title: "ETT developer/architect"  
          }
        };
        break;
    }

    const response:LambdaProxyIntegrationResponse = await handler(_event);
    log(response);
  })();
}