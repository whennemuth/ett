import { AffiliateTypes, Consenter, Entity, ExhibitForm as ExhibitFormData, YN } from "../../_lib/dao/entity";
import { ExhibitForm } from "../../_lib/pdf/ExhibitForm";
import { ExhibitFormFull } from "../../_lib/pdf/ExhibitFormFull";
import { ExhibitFormSingle } from "../../_lib/pdf/ExhibitFormSingle";
import { IPdfForm, PdfForm } from "../../_lib/pdf/PdfForm";
import { sendEmail } from "../../_lib/EmailWithAttachments";


export const enum FormTypes { FULL = 'full', SINGLE = 'single' };
export type FormType = FormTypes.FULL | FormTypes.SINGLE;

/**
 * This class represents an email issued by the system on behalf of a consenting individual to either 
 *   1) An authorized individual, where the email contains a pdf attachment that includes all affiliates 
 *      provided by the consenting individual. 
 *   2) An affliate where the email contains a pdf attachment that includes the details of the recipient
 *      only, as excerpted from the full exhibit form.
 */
export class ExhibitEmail {
  private data:ExhibitFormData;
  private formType:FormType;
  private entity:Entity;
  private consenter:Consenter;
  private pdf:IPdfForm; 

  /**
   * @param data The data to build the exhibit form from.
   * @param formType Full or single
   */
  constructor(data:ExhibitFormData, formType:FormType, entity:Entity, consenter:Consenter) {
    this.data = data;
    this.formType = formType;
    this.entity = entity;
    this.consenter = consenter;
  }

  public send = async (emailAddress:string):Promise<boolean> => {
    const { data, formType, entity, consenter, consenter: { firstname, middlename, lastname } } = this;
    const { fullName } = PdfForm;
    const consenterFullname = fullName(firstname, middlename, lastname);
    const { entity_name } = entity;
    
    switch(formType) {
      case FormTypes.FULL:
        this.pdf = new ExhibitFormFull(new ExhibitForm(data), consenter);
        return await sendEmail({
          subject: 'ETT Exhibit Form Submission',
          message: `Consenting individual ${consenterFullname} is forwarding you their full affliate list via ETT`,
          emailAddress,
          attachments: {
            pdf: this.pdf,
            name: 'exhibit-form-full.pdf',
            description: 'exhibit-form-full.pdf'
          }
        });
      case FormTypes.SINGLE:
        this.pdf = new ExhibitFormSingle(new ExhibitForm(data), consenter, emailAddress);
        return await sendEmail({
          subject: 'ETT Notice of Consent',
          message: `Consenting individual ${consenterFullname} has named you as an affilate for disclosure to ${entity_name}`,
          emailAddress,
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

export const test_entity = {
  entity_id: 'abc123',
  description: 'Boston University',
  entity_name: 'Boston University',
  active: YN.Yes,
} as Entity;

export const test_data = {
  entity_id: 'abc123',
  affiliates: [
    { 
      affiliateType: AffiliateTypes.EMPLOYER,
      org: 'Warner Bros.', 
      fullname: 'Foghorn Leghorn', 
      email: 'foghorn@warnerbros.com',
      title: 'Lead animation coordinator',
      phone_number: '617-333-4444'
    },
    {
      affiliateType: AffiliateTypes.ACADEMIC,
      org: 'Cartoon University',
      fullname: 'Bugs Bunny',
      email: 'bugs@cu.edu',
      title: 'Dean of school of animation',
      phone_number: '508-222-7777'
    },
    {
      affiliateType: AffiliateTypes.EMPLOYER,
      org: 'Warner Bros',
      fullname: 'Daffy Duck',
      email: 'daffy@warnerbros.com',
      title: 'Deputy animation coordinator',
      phone_number: '781-555-7777'
    },
    {
      affiliateType: AffiliateTypes.ACADEMIC,
      org: 'Cartoon University',
      fullname: 'Yosemite Sam',
      email: 'yosemite-sam@cu.edu',
      title: 'Professor animation studies',
      phone_number: '617-444-8888'
    }
  ]
} as ExhibitFormData;

if(args.length > 2 && args[2] == 'RUN_MANUALLY_SEND_EXHIBIT_FORM') {
  const email = process.env.PDF_RECIPIENT_EMAIL;

  if( ! email) {
    console.log('Email environment variable is missing. Put PDF_RECIPIENT_EMAIL=[email] in .env in ${workspaceFolder}');
    process.exit(1);
  }

  new ExhibitEmail(test_data, FormTypes.FULL, test_entity, { 
    firstname:'Porky', middlename: 'P', lastname: 'Pig'
  } as Consenter).send(email)
    .then(success => {
      console.log(success ? 'Succeeded' : 'Failed');
    })
    .catch(e => {
      console.error(e);
    });

}