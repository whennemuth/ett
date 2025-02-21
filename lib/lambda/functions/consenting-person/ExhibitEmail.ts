import * as ctx from '../../../../contexts/context.json';
import { IContext } from "../../../../contexts/IContext";
import { FormTypes } from "../../_lib/dao/entity";
import { sendEmail } from "../../_lib/EmailWithAttachments";
import { ExhibitForm, ExhibitFormParms, getSampleAffiliates, SampleExhibitFormParms } from "../../_lib/pdf/ExhibitForm";
import { ExhibitFormFull } from "../../_lib/pdf/ExhibitFormFull";
import { ExhibitFormSingle } from "../../_lib/pdf/ExhibitFormSingle";
import { IPdfForm, PdfForm } from "../../_lib/pdf/PdfForm";


/**
 * This class represents an email issued by the system on behalf of a consenting individual to either 
 *   1) An authorized individual, where the email contains a pdf attachment that includes all affiliates 
 *      provided by the consenting individual. 
 *   2) An affliate where the email contains a pdf attachment that includes the details of the recipient
 *      only, as excerpted from the full exhibit form.
 *   3) The consenting person themselves, where the email contains a pdf attachment that includes all affiliates.
 */
export class ExhibitEmail {
  private parms:ExhibitFormParms;
  private pdf:IPdfForm; 

  /**
   * @param data The data to build the exhibit form from.
   * @param formType Full or single
   */
  constructor(parms:ExhibitFormParms) {
    this.parms = parms;
  }

  public send = async (emailAddress:string):Promise<boolean> => {
    const { parms, parms: { data: { formType }, entity, consenter: { firstname, middlename, lastname } } } = this;
    const { fullName } = PdfForm;
    const consenterFullname = fullName(firstname, middlename, lastname);
    const { entity_name } = entity;
    const context:IContext = <IContext>ctx;
    
    switch(formType) {
      case FormTypes.FULL:
        this.pdf = new ExhibitFormFull(new ExhibitForm(parms));
        return await sendEmail({
          subject: 'ETT Exhibit Form Submission',
          from: `noreply@${context.ETT_DOMAIN}`,
          message: `Consenting individual ${consenterFullname} is forwarding you their full affliate list via ETT`,
          to: [ emailAddress ],
          attachments: {
            pdf: this.pdf,
            name: 'exhibit-form-full.pdf',
            description: 'exhibit-form-full.pdf'
          }
        });
      case FormTypes.SINGLE:
        this.pdf = new ExhibitFormSingle(new ExhibitForm(parms));
        return await sendEmail({
          subject: 'ETT Notice of Consent',
          from: `noreply@${context.ETT_DOMAIN}`,
          message: `Consenting individual ${consenterFullname} has named you as an affilate for disclosure to ${entity_name}`,
          to: [ emailAddress ],
          attachments: {
            pdf: this.pdf,
            name: 'exhibit-form-single.pdf',
            description: 'exhibit-form-single.pdf'
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
    ])).send(email)
    .then(success => {
      console.log(success ? 'Succeeded' : 'Failed');
    })
    .catch(e => {
      console.error(e);
    });

}