import * as ctx from '../../../../contexts/context.json';
import { IContext } from "../../../../contexts/IContext";
import { PublicApiConstruct } from "../../../PublicApi";
import { LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { Consenter } from '../../_lib/dao/entity';
import { ConsentForm, getBlankData as getBlankConsentData } from '../../_lib/pdf/ConsentForm';
import { DisclosureForm, getBlankData as getBlankDisclosureData } from '../../_lib/pdf/DisclosureForm';
import { ExhibitFormFullBoth } from "../../_lib/pdf/ExhibitFormFullBoth";
import { ExhibitFormFullCurrent } from "../../_lib/pdf/ExhibitFormFullCurrent";
import { ExhibitFormFullOther } from "../../_lib/pdf/ExhibitFormFullOther";
import { ExhibitFormSingleBoth } from "../../_lib/pdf/ExhibitFormSingleBoth";
import { ExhibitFormSingleCurrent } from "../../_lib/pdf/ExhibitFormSingleCurrent";
import { ExhibitFormSingleOther } from "../../_lib/pdf/ExhibitFormSingleOther";
import { IPdfForm } from "../../_lib/pdf/PdfForm";
import { getBlankData as getBlankRegistrationData, RegistrationFormEntity, RegistrationFormEntityData } from "../../_lib/pdf/RegistrationFormEntity";
import { RegistrationFormIndividual } from '../../_lib/pdf/RegistrationFormIndividual';
import { debugLog, error, errorResponse, invalidResponse, okPdfResponse } from "../../Utils";
import { consentFormUrl } from "../consenting-person/ConsentingPerson";

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
    const context:IContext = <IContext>ctx;

    if( ! formName ) {
      return invalidResponse(`Bad Request: ${pathParm} not specified (${Object.values(formName).join('|')})`);
    }
    if( ! Object.values<string>(FormName).includes(formName || '')) {
      return invalidResponse(`Bad Request: invalid form name specified (${Object.values(FormName).join('|')})`);
    }

    let form: IPdfForm | undefined;
    let bytes:Uint8Array;
    switch(formName as FormName) {
      
      case FormName.REGISTRATION_FORM_ENTITY:
        const blankRegData = getBlankRegistrationData() as RegistrationFormEntityData;
        blankRegData.loginHref = `https://${process.env.CLOUDFRONT_DOMAIN}`;
        blankRegData.termsHref = `https://${process.env.CLOUDFRONT_DOMAIN}${context.TERMS_OF_USE_PATH}`;
        form = new RegistrationFormEntity(blankRegData);
        break;

      case FormName.REGISTRATION_FORM_INDIVIDUAL:
        form = new RegistrationFormIndividual(
          {} as Consenter, 
          `https://${process.env.CLOUDFRONT_DOMAIN}${context.CONSENTING_PERSON_PATH}`
        );
        break;

      case FormName.CONSENT_FORM:
        const blankConsentData = getBlankConsentData();
        form = new ConsentForm(blankConsentData);
        break;

      case FormName.DISCLOSURE_FORM:
        const blankDisclosureData = getBlankDisclosureData();
        form = new DisclosureForm(blankDisclosureData);
        break;
  
      case FormName.EXHIBIT_FORM_CURRENT_FULL:
        form = ExhibitFormFullCurrent.getBlankForm();
        (form as ExhibitFormFullCurrent).consentFormUrl = consentFormUrl('[consenter_email]');
        break;

      case FormName.EXHIBIT_FORM_CURRENT_SINGLE:
        form = ExhibitFormSingleCurrent.getBlankForm();
        (form as ExhibitFormSingleCurrent).consentFormUrl = consentFormUrl('[consenter_email]');
        break;

      case FormName.EXHIBIT_FORM_OTHER_FULL:
        form = ExhibitFormFullOther.getBlankForm();
        (form as ExhibitFormFullOther).consentFormUrl = consentFormUrl('[consenter_email]');
        break;

      case FormName.EXHIBIT_FORM_OTHER_SINGLE:
        form = ExhibitFormSingleOther.getBlankForm();
        (form as ExhibitFormSingleOther).consentFormUrl = consentFormUrl('[consenter_email]');
        break;
        
      case FormName.EXHIBIT_FORM_BOTH_FULL:
        form = ExhibitFormFullBoth.getBlankForm();
        (form as ExhibitFormFullBoth).consentFormUrl = consentFormUrl('[consenter_email]');
        break;

      case FormName.EXHIBIT_FORM_BOTH_SINGLE:
        form = ExhibitFormSingleBoth.getBlankForm();
        (form as ExhibitFormSingleBoth).consentFormUrl = consentFormUrl('[consenter_email]');
        break;

      default:
        return invalidResponse(`Bad Request: form name ${formName} not implemented`);
    }

    bytes = await (form! as IPdfForm).getBytes();
    return okPdfResponse(bytes, `${formName}.pdf`);
  }
  catch(e:any) {
    error(e);
    return errorResponse(e.message);
  }
}