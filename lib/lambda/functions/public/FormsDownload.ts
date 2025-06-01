import * as ctx from '../../../../contexts/context.json';
import { IContext } from "../../../../contexts/IContext";
import { PUBLIC_API_ROOT_URL_ENV_VAR } from '../../../PublicApi';
import { Actions } from "../../../role/AbstractRole";
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
import { consentFormUrl } from '../consenting-person/ConsentingPersonUtils';
import { IndividualRegistrationFormData } from '../consenting-person/RegistrationEmail';

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

/**
 * Get the public url of the api gateway endpoint that serves up the bytes streams for downloadable pdf forms.
 * @param formName 
 * @returns 
 */
export const getPublicFormApiUrl = (formName:FormName, apiDomainName?:string):string => {
  let root = apiDomainName || process.env[PUBLIC_API_ROOT_URL_ENV_VAR] || '';
  if( ! root.startsWith('https://') ) {
    root = `https://${root}`;
  }
  const host = new URL(root).host;
  if( ! host ) {
    throw new Error(`Bad Request: unable to determine api domain name from ${root}`);
  }

  // Rebuild the full api gateway endpoint url for the public forms download endpoint from its host name.
  // https://<host>/<landscape>/public/forms/download/<form_name>
  const context:IContext = <IContext>ctx;
  const url = new URL('', `https://${host}`);
  const addResource = (resource:string) => url.pathname += url.pathname.endsWith('/') ? resource : `/${resource}`;
  addResource(context.TAGS.Landscape);
  addResource(Actions.public);
  addResource('forms');
  addResource('download');
  addResource(formName);
  return url.toString(); 
}

/**
 * Handler for the public API to download a form.
 * @param event 
 * @returns 
 */
export class Downloader {
  private formName:FormName;
  private apiDomainName:string;

  constructor(formName:string, apiDomainName:string) {
    this.formName = formName as FormName;
    this.apiDomainName = apiDomainName;
  }

  public getBytes = async ():Promise<Uint8Array> => {
    const context:IContext = <IContext>ctx;
    const { PATHS: {
      CONSENTING_PERSON_PATH,
      CONSENTING_PERSON_REGISTRATION_PATH,
      ENTITY_INVENTORY_PATH,
      TERMS_OF_USE_PATH,
      PRIVACY_POLICY_PATH
    }} = context;
    const { formName, apiDomainName } = this;
    let form: IPdfForm | undefined;

    switch(formName as FormName) {
      
      case FormName.REGISTRATION_FORM_ENTITY:
        const blankRegData = getBlankRegistrationData() as RegistrationFormEntityData;
        blankRegData.dashboardHref = `https://${process.env.CLOUDFRONT_DOMAIN}`;
        blankRegData.termsHref = `https://${process.env.CLOUDFRONT_DOMAIN}${TERMS_OF_USE_PATH}`;
        blankRegData.privacyHref = `https://${process.env.CLOUDFRONT_DOMAIN}${PRIVACY_POLICY_PATH}`;
        form = new RegistrationFormEntity(blankRegData);
        break;

      case FormName.REGISTRATION_FORM_INDIVIDUAL:
        form = new RegistrationFormIndividual({
          consenter: {} as Consenter, 
          dashboardHref: `https://${process.env.CLOUDFRONT_DOMAIN}${CONSENTING_PERSON_PATH}`,
          privacyHref: `https://${process.env.CLOUDFRONT_DOMAIN}${PRIVACY_POLICY_PATH}`,
        } as IndividualRegistrationFormData);
        break;

      case FormName.CONSENT_FORM:
        const blankConsentData = getBlankConsentData();
        blankConsentData.privacyHref = `https://${process.env.CLOUDFRONT_DOMAIN}${PRIVACY_POLICY_PATH}`;
        blankConsentData.dashboardHref = `https://${process.env.CLOUDFRONT_DOMAIN}${CONSENTING_PERSON_PATH}`;
        blankConsentData.registrationHref = `https://${process.env.CLOUDFRONT_DOMAIN}${CONSENTING_PERSON_REGISTRATION_PATH}`;
        blankConsentData.exhibitFormLink = getPublicFormApiUrl(FormName.EXHIBIT_FORM_BOTH_FULL, apiDomainName);
        blankConsentData.disclosureFormLink = getPublicFormApiUrl(FormName.DISCLOSURE_FORM, apiDomainName);
        blankConsentData.entityInventoryLink = `https://${process.env.CLOUDFRONT_DOMAIN}${ENTITY_INVENTORY_PATH}`;
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
        throw new Error(`Bad Request: form name ${formName} not implemented`);
    }

    return (form! as IPdfForm).getBytes();
  }
}