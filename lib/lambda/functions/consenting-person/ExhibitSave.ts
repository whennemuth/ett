import { LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { ConsenterCrud } from "../../_lib/dao/dao-consenter";
import { Consenter, ExhibitForm, YN } from "../../_lib/dao/entity";
import { deepClone, invalidResponse, log } from "../../Utils";
import { INVALID_RESPONSE_MESSAGES } from "./ConsentingPerson";
import { ConsenterInfo, getConsenterInfo, getConsenterResponse, scheduleExhibitFormPurgeFromDatabase } from "./ConsentingPersonUtils";
import { ConsentStatus } from "./ConsentStatus";


/**
 * Save exhibit form data to the database.
 * @param email 
 * @param exhibitForm 
 * @param isNew Save a new exhibit form (true) or update and existing one (false)
 * @returns 
 */
export const saveExhibit = async (email:string, exhibitForm:ExhibitForm): Promise<LambdaProxyIntegrationResponse> => {
  email = email.toLowerCase();

  // Validate incoming data
  if( ! exhibitForm) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.missingExhibitData);
  }

  // Abort if consenter lookup fails
  const consenterInfo = await getConsenterInfo(email, false) as ConsenterInfo;
  if( ! consenterInfo) {
    return invalidResponse(INVALID_RESPONSE_MESSAGES.noSuchConsenter + ' ' + email );
  }

  const { consentStatus } = consenterInfo;
  const { ACTIVE, EXPIRED } = ConsentStatus;

  // Abort if the consenter has not yet consented
  if(consentStatus != ACTIVE) {
    if(consentStatus == EXPIRED) {
      return invalidResponse(INVALID_RESPONSE_MESSAGES.expiredConsent);
    }
    if(consenterInfo?.consenter?.active != YN.Yes) {
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
  const dao = ConsenterCrud({ consenterInfo: newConsenter });
  await dao.update(oldConsenter, true); // NOTE: merge is set to true - means that other exhibit forms are retained.

  // Create a delayed execution to remove the exhibit form 2 days from now
  await scheduleExhibitFormPurgeFromDatabase(newConsenter, exhibitForm);

  return getConsenterResponse(email, true);
};
