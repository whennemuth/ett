import { IContext } from "../../../../contexts/IContext";
import * as ctx from '../../../../contexts/context.json';
import { DAOFactory } from "../../_lib/dao/dao";
import { Consenter, Entity, ExhibitFormConstraints, YN } from "../../_lib/dao/entity";
import { EmailParms, sendEmail } from "../../_lib/EmailWithAttachments";
import { PdfForm } from "../../_lib/pdf/PdfForm";
import { lookupCloudfrontDomain } from "../../Utils";
import { AffilatePositionAcademic, AffilatePositionAcademicStrings, AffiliatePosition, AffiliatePositionCategory, AffiliatePositionCustom, AffiliatePositionEmployer, AffiliatePositionEmployerStrings, AffiliatePositionOther, AffiliatePositionOtherStrings, AffiliatePositionsCustom } from "./ExhibitFormRequest";
import { ConsentForm, ConsentFormData } from "../../_lib/pdf/ConsentForm";
import { FormName, getPublicFormApiUrl } from "../public/FormsDownload";
import { PUBLIC_API_ROOT_URL_ENV_VAR } from "../../../PublicApi";

export type ExhibitFormRequestEmailParms = {
  consenterEmail:string;
  entity_id:string;
  linkUri:string;
  constraint: ExhibitFormConstraints,
  lookback?:string
  positions?:AffiliatePosition[]
}

export class ExhibitFormRequestEmail {
  private parms:ExhibitFormRequestEmailParms;

  constructor(parms:ExhibitFormRequestEmailParms) {
    this.parms = parms;
  }

  public send = async ():Promise<boolean> => {
    let { parms: { consenterEmail, entity_id, linkUri, constraint, lookback, positions=[] }} = this;
    const { BOTH, CURRENT, OTHER } = ExhibitFormConstraints;
    if((linkUri ?? '').endsWith('/')) {
      linkUri = linkUri.substring(0, linkUri.length -1); // Clip off trailing '/'
    }

    // Get the consenter
    const consenterDao = DAOFactory.getInstance({ DAOType: 'consenter', Payload: { email: consenterEmail} as Consenter});
    const consenter = await consenterDao.read() as Consenter;
    const { firstname, middlename, lastname, active:activeConsenter } = consenter;
    if(activeConsenter == YN.No) {
      console.log(`Cannot send exhibit form request to ${consenterEmail} for ${entity_id} because consenter is inactive`);
      return false;
    }
    const consenterFullName = PdfForm.fullName(firstname, middlename, lastname);

    // Get the entity
    const entityDao = DAOFactory.getInstance({ DAOType: 'entity', Payload: { entity_id } as Entity });
    const entity = await entityDao.read() as Entity;
    const { entity_name, active:activeEntity } = entity;
    if(activeEntity == YN.No) {
      console.log(`Cannot send exhibit form request to ${consenterEmail} for ${entity_id} because entity is inactive`);
      return false;
    }
  
    // Get who the email will say it is from
    const context:IContext = <IContext>ctx;
    const from = `noreply@${context.ETT_DOMAIN}`;

    // Prevent any special characters in the link from being interpreted as HTML
    linkUri = linkUri
      .replace(/&/g, "&amp;")
      .replace(/=/g, "=3D");  // Ensure '=' is properly handled in quoted-printable

    // Prepare verbiage for the positions of interest
    let positionsMsg = '';
    type PositionData = { category:AffiliatePositionCategory, value:string }
    const getPositionData = (position:AffiliatePosition):PositionData => {
      const { id } = position;
      if(Object.keys(AffiliatePositionEmployer).includes(id.toString())) {
        return { 
          category:AffiliatePositionCategory.EMPLOYER, 
          value:AffiliatePositionEmployer[id as unknown as AffiliatePositionEmployerStrings]
        };
      }
      else if(Object.keys(AffilatePositionAcademic).includes(id.toString())) {
        return { 
          category:AffiliatePositionCategory.ACADEMIC, 
          value:AffilatePositionAcademic[id as unknown as AffilatePositionAcademicStrings]
        };
      }
      else if(Object.keys(AffiliatePositionOther).includes(id.toString())) {
        return { 
          category:AffiliatePositionCategory.OTHER, 
          value:AffiliatePositionOther[id as unknown as AffiliatePositionOtherStrings]
        };
      }
      else {
        switch(position.id as AffiliatePositionsCustom) {
          case AffiliatePositionsCustom.ACADEMIC:
            return { 
              category: AffiliatePositionCategory.ACADEMIC, value: position.value as AffilatePositionAcademicStrings 
            };
          case AffiliatePositionsCustom.EMPLOYER:
            return {
              category: AffiliatePositionCategory.EMPLOYER, value: position.value as AffiliatePositionEmployerStrings
            }
          case AffiliatePositionsCustom.OTHER:
            return {
              category: AffiliatePositionCategory.OTHER, value: position.value as AffiliatePositionOtherStrings
            }
        }
      }
    }

    positionsMsg = 'Please note, we are interested in individuals who hold/held the following positions:';
    positionsMsg += `<ul>`;
    positions.forEach((position) => {
      const { category, value } = getPositionData(position);
      positionsMsg += `<li><b>${category}:</b> ${value}</li>`;
    });
    positionsMsg += `</ul>`;

    const { PATHS: { 
      PRIVACY_POLICY_PATH, CONSENTING_PERSON_PATH, ENTITY_INVENTORY_PATH, CONSENTING_PERSON_REGISTRATION_PATH
    }} = context;
    const { CLOUDFRONT_DOMAIN, PRIMARY_DOMAIN } = process.env;
    const domain = PRIMARY_DOMAIN || CLOUDFRONT_DOMAIN;
    const privacyHref = `https://${domain}${PRIVACY_POLICY_PATH}`;
    const dashboardHref = `https://${domain}${CONSENTING_PERSON_PATH}`;
    const registrationHref = `https://${domain}${CONSENTING_PERSON_REGISTRATION_PATH}`;

    let paragraph1 = 
      `${entity_name} uses the Ethnical Transparency Tool (ETT) when considering individuals for certain ` +
      `privileges or honors, employment or other roles to help create a norm of transparency about whether or ` +
      `not there have been findings (not allegations) of misconduct against a person (sexual/gender, ` +
      `race/ethnicity, financial, scientific/research, and licensure). We seek to create a healthy climate ` +
      `for everyone, while treating everyone, including candidates, ethically and recognizing people may ` +
      `learn, correct past behaviors and regain trust. ETT is just a tool to gain some basic and reliable ` +
      `information and does not address or dictate who is qualified or should be selected. We make those ` +
      `assessments independently based on all relevant information and our own criteria and judgments. ` +
      `See the end of this email for more information on ETT.`;

    let paragraph2 = `At this stage of our process to consider you for one of the privileges or honors, ` +
      `employment or other roles for which we use the Ethical Transparency Tool to gain some basic and ` +
      `reliable information about you, we soon intend to make Disclosure Requests to your professionally ` +
      `affiliated organizations that are covered by your ETT Consent Form. We intend to seek disclosures from `;

    const paragraph3 = 'If you have any questions, please feel free to contact <b>respond to all who are ' +
      'copied on this email</b> and we’ll provide help. <b>You will not be able to respond to ETT.</b>';

    const paragraph4 = 'Thank you again for joining us in leading to help create a climate where everyone can thrive!';

    switch(constraint) {
      case BOTH:
        paragraph2 += `all of your <b>current</b> professionally affiliated organizations (employers, other ` +
          `appointing organizations, academic, professional and field-related honorary and membership ` +
          `organizations), as well as your professionally affiliated organizations over the last ` +
          `${lookback} years. Consequently, we ask you ` +
          `at this time to very promptly complete Exhibit Forms at this link:</p><p>${linkUri}</p> to ` +
          `pair with the Consent Form that you have already completed. Exhibit Forms provide an ` +
          `up-to-date list of the name(s) and contact(s) for your known professional affiliates that ` +
          `are covered by your consent and authorized by you to make disclosures directly to ${entity_name}.`;
        break;
      case CURRENT:
        paragraph1 = `At this stage of our process to consider you for one of the privileges or honors, ` +
          `employment or other roles for which we use the Ethical Transparency Tool to gain some basic and ` +
          `reliable information about you, we soon intend to make Disclosure Requests to your <b>current</b> employers ` +
          `and other <b>current</b> appointing organizations. Consequently, we ask you at this time to very promptly ` +
          `complete Exhibit Forms at this link:</p><p>${linkUri}</p> to pair with the Consent Form that you have already ` +
          `completed. Exhibit Forms provide an up-to-date list of the name(s) and contact(s) for your known ` +
          `professional affiliates that are covered by your consent and authorized to make disclosures directly ` +
          `to ${entity_name}.`;
        paragraph2 = '';
        break;
      case OTHER:
        paragraph2 += `first, to all of your <b>prior</b> employers and other <b>prior</b> appointing organizations ` +
          `over the last ${lookback} years, as well as ` +
          `to your <b>current and prior</b> (same look-back period) academic, professional and field-related ` +
          `honorary and membership organizations. Consequently, we ask you at this time to very promptly ` +
          `complete Exhibit Forms at this  link:</p><p>${linkUri}</p> to pair with the Consent Form that you have ` +
          `already completed. Exhibit Forms provide an up-to-date list of the name(s) and contact(s) ` +
          `for your known professional affiliates that are covered by your consent and authorized to make ` +
          `disclosures directly to ${entity_name}<br><br>` +
          `Later in our process, we may want to request disclosures from your current employers and ` +
          `other current appointing organizations. If so, we’ll ask you to complete additional Exhibit ` +
          `Forms for them.`;
        break;
      default:
        throw new Error(`Unknown constraint: ${constraint}`);
    }

    return sendEmail({
      subject: `ETT Exhibit Form Request`,
      to: [ consenterEmail ],
      message: `<p>Dear ${consenterFullName},</p>` +
        `<p>${paragraph1}</p>` +
        (paragraph2 ? `<p>${paragraph2}</p>` : '') +
        `<p>${paragraph3}</p>` + 
        `<p>${paragraph4}</p>`,
      from,
      pdfAttachments: [
        {
          pdf: new ConsentForm({ 
            consenter: consenter as Consenter, 
            entityName: 
            entity_name, 
            privacyHref, 
            dashboardHref,
            registrationHref,
            exhibitFormLink: getPublicFormApiUrl(FormName.EXHIBIT_FORM_BOTH_FULL),
            disclosureFormLink: getPublicFormApiUrl(FormName.DISCLOSURE_FORM),
            entityInventoryLink: `https://${domain}${ENTITY_INVENTORY_PATH}`
          } as ConsentFormData),
          name: 'consent-form.pdf',
          description: 'consent-form.pdf',
        }
      ]
    } as EmailParms);  
  }
}




/**
 * RUN MANUALLY: Modify email as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/authorized-individual/ExhibitFormRequestEmail.ts')) {

  const consenterEmail = 'cp1@warhen.work';
  const entity_id = '45e4b462-eacc-4660-b9b2-2a750ea19f47';

  (async() => {
    // 1) Get context variables
    const context:IContext = await require('../../../../contexts/context.json');
    const { REGION, TAGS: { Landscape }} = context;
    process.env.REGION = REGION;
    process.env[PUBLIC_API_ROOT_URL_ENV_VAR] = `https://${Landscape}.some-domain.com/some/path`; // Set a dummy value for the public api root url env var

    // 2) Get the cloudfront domain
    const cloudfrontDomain = await lookupCloudfrontDomain(Landscape);
    if( ! cloudfrontDomain) {
      throw('Cloudfront domain lookup failure');
    }
    process.env.CLOUDFRONT_DOMAIN = cloudfrontDomain;
    
    // 3) Send the email
    await new ExhibitFormRequestEmail({ 
      consenterEmail, 
      entity_id, 
      linkUri:`https://${cloudfrontDomain}`, 
      constraint: ExhibitFormConstraints.CURRENT,
      lookback: '5',
      positions: [ 
        { id:AffiliatePositionsCustom.EMPLOYER, value:'Manager of things and stuff' },
        { id:'fc' },
        { id:'nc' }
      ]
    } as ExhibitFormRequestEmailParms).send();

    console.log('Email sent!');
  })();

}