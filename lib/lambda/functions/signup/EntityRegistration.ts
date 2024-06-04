import { LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { DAOFactory } from "../../_lib/dao/dao";
import { ENTITY_WAITING_ROOM } from "../../_lib/dao/dao-entity";
import { Invitation, User, YN } from "../../_lib/dao/entity";
import { Registration } from "../../_lib/invitation/Registration";
import { debugLog, errorResponse, invalidResponse, lookupCloudfrontDomain, lookupSingleActiveEntity, okResponse, unauthorizedResponse } from "../Utils";
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

    const { entity_id } = invitation;

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

      // Officially set the invitation as registered, replace its dummy email with the true value, and set its fullname.
      // The PostSignup trigger lambda will come by later and "scrape" these out of the invitation for its own needs.
      case Task.REGISTER:
        if( ! event.queryStringParameters) {
          return invalidResponse('Bad Request: Missing querystring parameters');
        }
        let { email, fullname, title } = event.queryStringParameters;

        if( ! email) {
          return invalidResponse('Bad Request: Missing email querystring parameter');
        }
        if( ! fullname) {
          return invalidResponse('Bad Request: Missing fullname querystring parameter');
        }

        email = decodeURIComponent(email);
        fullname = decodeURIComponent(fullname);
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
        if( await registration.registerUser({ email, fullname, title } as Invitation)) {
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
    console.log(e);
    return errorResponse(e.message);
  }
}


/**
 * RUN MANUALLY: Modify the task, landscape, region, invitation-code, and queryStringParameters as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY') {
  
  const task = Task.REGISTER;
  const landscape = 'dev';

  lookupCloudfrontDomain(landscape).then((cloudfrontDomain) => {
    if( ! cloudfrontDomain) {
      throw('Cloudfront domain lookup failure');
    }
    process.env.DYNAMODB_INVITATION_TABLE_NAME = 'ett-invitations';
    process.env.DYNAMODB_USER_TABLE_NAME = 'ett-users';
    process.env.DYNAMODB_ENTITY_TABLE_NAME = 'ett-entities'
    process.env.CLOUDFRONT_DOMAIN = cloudfrontDomain;
    process.env.REGION = 'us-east-2'
    process.env.DEBUG = 'true';

    const _event = {
      pathParameters: {
        task,
        ['invitation-code']: '4c738e91-08ba-437b-93ed-e9dd73ff64f5'
      },
      queryStringParameters: {
        email: "wrh@bu.edu",
        fullname: "Warren Hennemuth",
        title: "ETT developer/architect"  
      }
    }

    return handler(_event);

  }).then(() => {
    console.log(`${task} complete.`)
  }).catch((reason) => {
    console.error(reason);
  });

}