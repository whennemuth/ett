import { Invitation } from "../../_lib/dao/entity";
import { Registration } from "../../_lib/invitation/Registration";
import { debugLog, errorResponse, okResponse, unauthorizedResponse } from "../Utils";

export const handler = async(event:any) => {

  try {
    debugLog(event);

    const { 'invitation-code':code } = event.pathParameters;

    if( ! code ) {
      return unauthorizedResponse('Unauthorized: Invitation code missing');
    }

    const registration = new Registration(code);

    const invitation = await registration.getInvitation() as Invitation;

    if( invitation == null) {
      return unauthorizedResponse(`Unauthorized: Unknown invitation code ${code}`);
    }

    const { acknowledged_timestamp: timestamp } = invitation;
    if(timestamp) {
      return okResponse(`Ok: Already acknowledged at ${timestamp}`);
    }

    if( await registration.registerAcknowledgement()) {
      return okResponse(`Ok: Acknowledgement registered for ${code}`);
    }

    return errorResponse('Error: Acknowledgement failed!');
  }
  catch(e:any) {
    console.log(e);
    return errorResponse(e.message);
  }
}

