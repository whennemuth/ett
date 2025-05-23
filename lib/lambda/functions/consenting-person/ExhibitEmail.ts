import * as ctx from '../../../../contexts/context.json';
import { IContext } from "../../../../contexts/IContext";
import { ExhibitFormConstraints, FormTypes, roleFullName, Roles } from "../../_lib/dao/entity";
import { sendEmail } from "../../_lib/EmailWithAttachments";
import { ExhibitFormParms, getSampleAffiliates, SampleExhibitFormParms } from "../../_lib/pdf/ExhibitForm";
import { ExhibitFormFullBoth } from '../../_lib/pdf/ExhibitFormFullBoth';
import { ExhibitFormFullCurrent } from '../../_lib/pdf/ExhibitFormFullCurrent';
import { ExhibitFormFullOther } from '../../_lib/pdf/ExhibitFormFullOther';
import { ExhibitFormSingleBoth } from '../../_lib/pdf/ExhibitFormSingleBoth';
import { ExhibitFormSingleCurrent } from '../../_lib/pdf/ExhibitFormSingleCurrent';
import { ExhibitFormSingleOther } from '../../_lib/pdf/ExhibitFormSingleOther';
import { IPdfForm, PdfForm } from "../../_lib/pdf/PdfForm";
import { FormName } from '../public/FormsDownload';

export type ExhibitEmailOverrides = {
  subject?:string;
  from?:string;
  message?:string;
}

/**
 * This class represents an email issued by the system on behalf of a consenting individual to either 
 *   1) An authorized individual, where the email contains a pdf attachment that includes all affiliates 
 *      provided by the consenting individual. 
 *   2) An affiliate where the email contains a pdf attachment that includes the details of the recipient
 *      only, as excerpted from the full exhibit form.
 *   3) The consenting person themselves, where the email contains a pdf attachment that includes all affiliates.
 */
export class ExhibitEmail {
  private parms:ExhibitFormParms;
  private pdf:IPdfForm; 
  private overrides:ExhibitEmailOverrides;

  /**
   * 
   * @param parms The data to build the exhibit form from and the form type.
   */
  constructor(parms:ExhibitFormParms, overrides?:ExhibitEmailOverrides) {
    this.parms = parms;
    this.overrides = overrides ?? {};
  }

  public send = async (to:string[], cc?:string[]):Promise<boolean> => {
    const { parms, parms: { data: { formType, constraint }, entity, consenter: { firstname, middlename, lastname } } } = this;
    const { fullName } = PdfForm;
    const consenterFullname = fullName(firstname, middlename, lastname);
    const { entity_name } = entity;
    const context:IContext = <IContext>ctx;
    const { BOTH, CURRENT, OTHER } = ExhibitFormConstraints;
    
    if( ! formType) {
      throw new Error('Form type is missing');
    }
    
    if( ! constraint) {
      throw new Error('Constraint is missing');
    }

    let { from, message, subject } = this.overrides;
    
    let name:string|undefined = undefined;
    switch(formType) {
      
      case FormTypes.FULL:
        const { EXHIBIT_FORM_BOTH_FULL, EXHIBIT_FORM_OTHER_FULL, EXHIBIT_FORM_CURRENT_FULL } = FormName;
        let action:string = '';
        switch(constraint) {
          case CURRENT:
            this.pdf = ExhibitFormFullCurrent.getInstance(parms);
            name = EXHIBIT_FORM_CURRENT_FULL;
            action = 'forwarding you their current employer affiliate list via ETT';
            if(message) message = `${message} current employer affiliate list`;
            break;
          case OTHER:
            this.pdf = ExhibitFormFullOther.getInstance(parms);
            name = EXHIBIT_FORM_OTHER_FULL;
            action = 'forwarding you their full affiliate list via ETT, omitting any current employer(s)';
            if(message) message = `${message} full affiliate list, omitting any current employer(s)`;
            break;
          case BOTH: default:
            this.pdf = ExhibitFormFullBoth.getInstance(parms);
            name = EXHIBIT_FORM_BOTH_FULL;
            action = 'forwarding you their full affiliate list via ETT';
            if(message) message = `${message} full affiliate list`;
            break;
        }
        return await sendEmail({
          subject: subject ?? 'ETT Exhibit Form Submission',
          from: from ?? `noreply@${context.ETT_DOMAIN}`,
          message: message ?? `${roleFullName(Roles.CONSENTING_PERSON)} ${consenterFullname} is ${action}`,
          to, cc,
          pdfAttachments: {
            pdf: this.pdf,
            name: `${name}.pdf`,
            description: `${name}.pdf`
          }
        });

      case FormTypes.SINGLE:
        const { EXHIBIT_FORM_BOTH_SINGLE, EXHIBIT_FORM_CURRENT_SINGLE, EXHIBIT_FORM_OTHER_SINGLE } = FormName;
        switch(constraint) {
          case CURRENT:
            this.pdf = ExhibitFormSingleCurrent.getInstance(parms);
            name = EXHIBIT_FORM_CURRENT_SINGLE;
            break;
          case OTHER:
            this.pdf = ExhibitFormSingleOther.getInstance(parms);
            name = EXHIBIT_FORM_OTHER_SINGLE;
            break;
          case BOTH: default:
            this.pdf = ExhibitFormSingleBoth.getInstance(parms);
            name = EXHIBIT_FORM_BOTH_SINGLE;
            break;
        }
        return await sendEmail({
          subject: subject ?? 'ETT Notice of Consent',
          from: from ?? `noreply@${context.ETT_DOMAIN}`,
          message: message ?? `${roleFullName(Roles.CONSENTING_PERSON)} ${consenterFullname} has named you as an affilate for disclosure to ${entity_name}`,
          to, cc,
          pdfAttachments: {
            pdf: this.pdf,
            name: `${name}.pdf`,
            description: `${name}.pdf`
          }
        });
    }
   }

  public getAttachment = ():IPdfForm => {
    return this.pdf;
  }
}



/**
 * RUN MANUALLY: Modify the task, landscape, email, role, & entity_id as needed.
 */
const { argv:args } = process;

if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/consenting-person/ExhibitEmail.ts')) {
  const email = process.env.PDF_RECIPIENT_EMAIL;
  process.env.CLOUDFRONT_DOMAIN = 'www.schoolofhardknocks.edu';

  if( ! email) {
    console.log('Email environment variable is missing. Put PDF_RECIPIENT_EMAIL=[email] in .env in ${workspaceFolder}');
    process.exit(1);
  }

  new ExhibitEmail(SampleExhibitFormParms([
      getSampleAffiliates().employerPrimary,
      getSampleAffiliates().employer1, 
      getSampleAffiliates().employer2, 
      getSampleAffiliates().employerPrior, 
      getSampleAffiliates().academic1,
      getSampleAffiliates().other
    ])).send([ email ])
    .then(success => {
      console.log(success ? 'Succeeded' : 'Failed');
    })
    .catch(e => {
      console.error(e);
    });

}