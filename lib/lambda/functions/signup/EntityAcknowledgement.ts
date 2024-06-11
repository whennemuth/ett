import { DynamoDbConstruct } from "../../../DynamoDb";
import { Invitation } from "../../_lib/dao/entity";
import { Registration } from "../../_lib/invitation/Registration";
import { debugLog, errorResponse, invalidResponse, lookupCloudfrontDomain, okResponse, unauthorizedResponse } from "../Utils";

export enum Task {
  LOOKUP_INVITATION = 'lookup-invitation',
  REGISTER = 'register'
}

export const handler = async(event:any) => {

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

    switch(task) {
  
      // Just want the invitation, probably to know its acknowledge and registration statuses.
      case Task.LOOKUP_INVITATION:
        return okResponse('Ok', invitation);

      case Task.REGISTER:
        const { acknowledged_timestamp: timestamp } = invitation;
        if(timestamp) {
          return okResponse(`Ok: Already acknowledged at ${timestamp}`);
        }
        if( await registration.registerAcknowledgement()) {
          return okResponse(`Ok: Acknowledgement registered for ${code}`);
        }
        break;
    }
    return errorResponse('Error: Acknowledgement failed!');    
  }
  catch(e:any) {
    console.log(e);
    return errorResponse(e.message);
  }
}


/**
 * RUN MANUALLY: Modify the task, landscape, invitation-code, and region as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_ACKNOWLEDGEMENT') {
  
  const task = Task.REGISTER;
  const landscape = 'dev';
 
  lookupCloudfrontDomain(landscape).then((cloudfrontDomain) => {
    if( ! cloudfrontDomain) {
      throw('Cloudfront domain lookup failure');
    }
    process.env.DYNAMODB_INVITATION_TABLE_NAME = DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME;
    process.env.DYNAMODB_USER_TABLE_NAME = DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME;
    process.env.DYNAMODB_ENTITY_TABLE_NAME = DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME;
    process.env.DYNAMODB_INVITATION_EMAIL_INDEX = DynamoDbConstruct.DYNAMODB_INVITATION_EMAIL_INDEX;
    process.env.DYNAMODB_INVITATION_ENTITY_INDEX = DynamoDbConstruct.DYNAMODB_INVITATION_ENTITY_INDEX;
    process.env.CLOUDFRONT_DOMAIN = 'd2ccz25lye7ni0.cloudfront.net';
    process.env.REGION = 'us-east-2'
    process.env.DEBUG = 'true';

    const _event = {
      pathParameters: {
        ['invitation-code']: '4c738e91-08ba-437b-93ed-e9dd73ff64f5'
      }
    }

    return handler(_event);

  }).then(() => {
    console.log(`${task} complete.`)
  }).catch((reason) => {
    console.error(reason);
  });  

}