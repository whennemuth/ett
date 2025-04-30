import { LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { ReadParms } from "../../_lib/dao/dao";
import { EntityCrud } from "../../_lib/dao/dao-entity";
import { InvitationCrud } from "../../_lib/dao/dao-invitation";
import { Entity, Invitation, Roles, User } from "../../_lib/dao/entity";
import { errorResponse, invalidResponse, log, okResponse, warn } from "../../Utils";
import { sendRegistrationForm } from "../cognito/PostSignup";
import { EntityToCorrect } from "./correction/EntityCorrection";
import { Personnel } from "./correction/EntityPersonnel";

/**
 * Change the name of the specified entity
 * @param entity_id 
 * @param name 
 * @returns 
 */
export const amendEntityName = async (entity_id:string, name:string, callerSub:string): Promise<LambdaProxyIntegrationResponse> => {
  log({ entity_id, name }, `amendEntityName`)
  if( ! entity_id) {
    return invalidResponse('Missing entity_id parameter');
  }
  if( ! name) {
    return invalidResponse('Missing name parameter');
  }
  const corrector = new EntityToCorrect(new Personnel({ entity: entity_id }));
  await corrector.correctEntity({ now: { entity_id, entity_name:name } as Entity, correctorSub: callerSub });
  return okResponse('Ok', {});
}

/**
 * Remove a user from the specified entity and optionally invite a replacement
 * @param parms 
 * @returns 
 */
export const amendEntityUser = async (parms:any): Promise<LambdaProxyIntegrationResponse> => {
  log(parms, `amendEntityUser`)
  var { entity_id, replacerEmail, replaceableEmail, replacementEmail, registrationUri } = parms;
  if( ! entity_id) {
    return invalidResponse('Missing entity_id parameter');
  }
  if( ! replaceableEmail) {
    return invalidResponse('Missing replaceableEmail parameter');
  }

  const corrector = new EntityToCorrect(new Personnel({ entity:entity_id, replacer:replacerEmail, registrationUri }));
  const corrected = await corrector.correctPersonnel({ replaceableEmail, replacementEmail });
  if(corrected) {
    return okResponse('Ok', {});
  }
  return errorResponse(`Entity correction failure: ${corrector.getMessage()}`);
}

/**
 * If a registration was carried out with an amendment to immediately follow, the issuance of the email
 * carrying a pdf copy of the registration form is postponed until the amendment is complete, and that
 * amendment does not result in an entity role vacancy.
 * @param signup_parameter 
 */
export const handleRegistrationAmendmentCompletion = async (amenderEmail:string, entity_id:string):Promise<LambdaProxyIntegrationResponse> => {

  // Lookup the invitation of the corrector to the entity for "stashed" information.
  let invitation = { } as Invitation;
  const invitations = await InvitationCrud({ 
    email:amenderEmail, entity_id 
  } as Invitation).read({ convertDates:false } as ReadParms) as Invitation[];
  if(invitations.length > 0) {
    // Return the most recent invitation
    invitations.sort((a, b) => {
      return new Date(b.sent_timestamp).getTime() - new Date(a.sent_timestamp).getTime();
    });
    invitation = invitations[0];
  }
  else {
    // This might happen if the invitation expires while the registration is being completed.
    warn({ amenderEmail, entity_id }, 'No invitation found');
    return errorResponse(`No invitation found for ${amenderEmail} in entity ${entity_id}`);
  }

  const { signup_parameter } = invitation;

  // If the invitation indicates the user chose to amend the entity during registration, issue the registration email now.
  if(signup_parameter == 'amend') {
    const entity = await EntityCrud({ entity_id } as Entity).read() as Entity;
    const { entity_name } = entity;
    log({ signup_parameter, email:amenderEmail, entity_name }, 'Postponed registration email issuance');
    await sendRegistrationForm({ email:amenderEmail, role:Roles.RE_AUTH_IND } as User, Roles.RE_AUTH_IND, entity_name);
    invitation.signup_parameter = 'amended';
    // Update the invitation to reflect the registration amendment was carried out.
    log(invitation, 'Changing invitation signup_parameter to "amended"');
    await InvitationCrud(invitation).update();
  }
  return okResponse('Ok', {});
}