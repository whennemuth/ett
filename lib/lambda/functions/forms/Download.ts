import { PublicApiConstruct } from "../../../PublicApi";
import { LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { ExhibitForm } from "../../_lib/pdf/ExhibitForm";
import { ExhibitFormFullCurrent } from "../../_lib/pdf/ExhibitFormFullCurrent";
import { debugLog, error, errorResponse, invalidResponse, okPdfResponse } from "../../Utils";

export enum FormName {
  REGISTRATION_FORM_ENTITY = 'registration-form-entity',
  REGISTRATION_FORM_INDIVIDUAL = 'registration-form-individual',
  CONSENT_FORM = 'consent-form',
  EXHIBIT_FORM_CURRENT_FULL = 'exhibit-form-current-full',
  EXHIBIT_FORM_CURRENT_SINGLE = 'exhibit-form-current-single',
  EXHIBIT_FORM_OTHER_FULL = 'exhibit-form-other-full',
  EXHIBIT_FORM_OTHER_SINGLE = 'exhibit-form-other-single',
  EXHIBIT_FORM_BOTH_FULL = 'exhibit-form-both-full',
  EXHIBIT_FORM_BOTH_SINGLE = 'exhibit-form-both-single',
  DISCLOSURE_FORM = 'disclosure-form',
}

export const handler = async(event:any):Promise<LambdaProxyIntegrationResponse> => {

  try {
    debugLog(event);

    const { FORM_NAME_PATH_PARAM: pathParm} = PublicApiConstruct;
    const { [pathParm]:formName } = event.pathParameters;

    if( ! formName ) {
      return invalidResponse(`Bad Request: ${pathParm} not specified (${Object.values(formName).join('|')})`);
    }
    if( ! Object.values<string>(FormName).includes(formName || '')) {
      return invalidResponse(`Bad Request: invalid form name specified (${Object.values(FormName).join('|')})`);
    }

    switch(formName as FormName) {
      case FormName.REGISTRATION_FORM_ENTITY:
        break;
      case FormName.REGISTRATION_FORM_INDIVIDUAL:
        break;
      case FormName.CONSENT_FORM:
        break;
      case FormName.EXHIBIT_FORM_CURRENT_FULL:
        const domain = process.env.CLOUDFRONT_DOMAIN;
        const consentFormUrl = `https://${domain}/consenting`;
        const form = new ExhibitFormFullCurrent(new ExhibitForm());
        form.consentFormUrl = consentFormUrl;
        const bytes:Uint8Array = await form.getBytes();
        return okPdfResponse(bytes, `${formName}.pdf`);
      case FormName.EXHIBIT_FORM_CURRENT_SINGLE:
        break;
      case FormName.EXHIBIT_FORM_OTHER_FULL:
        break;
      case FormName.EXHIBIT_FORM_OTHER_SINGLE:
        break;
      case FormName.EXHIBIT_FORM_BOTH_FULL:
        break;
      case FormName.EXHIBIT_FORM_BOTH_SINGLE:
        break;
      case FormName.DISCLOSURE_FORM:
        break;
    }

    return invalidResponse(`Bad Request: form name ${formName} not implemented`);
  }
  catch(e:any) {
    error(e);
    return errorResponse(e.message);
  }
}