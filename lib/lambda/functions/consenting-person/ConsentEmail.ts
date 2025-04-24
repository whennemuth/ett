import { YN } from "../../_lib/dao/entity";
import { ConsentForm, ConsentFormData } from "../../_lib/pdf/ConsentForm";
import { PdfForm } from "../../_lib/pdf/PdfForm";
import { sendEmail } from "../../_lib/EmailWithAttachments";
import * as ctx from '../../../../contexts/context.json';
import { IContext } from "../../../../contexts/IContext";

/**
 * This class represents an email that is issued to a recipient who has requested a copy of a consenters
 * consent form.
 */
export class ConsentFormEmail {
  private data:ConsentFormData;

  constructor(data:ConsentFormData) {
    this.data = data;
  }

  public send = async (emailAddress?:string):Promise<boolean> => {
    const { data: { entityName, consenter, consenter: { email, firstname, middlename, lastname }}} = this;
    const { fullName } = PdfForm;
    const consenterFullName = fullName(firstname, middlename, lastname);
    emailAddress = emailAddress ?? email;
    const context:IContext = <IContext>ctx;
    const privacyHref = `https://${process.env.CLOUDFRONT_DOMAIN}${context.PRIVACY_POLICY_PATH}`;

    return await sendEmail({
      subject: 'ETT Individual Consent Form',
      from: `noreply@${context.ETT_DOMAIN}`, 
      message:  
        `Greetings ${consenterFullName}.<br>` +
        `Thankyou for granting consent for disclosures with ETT.<br>` +
        `Please find enclosed a pdf copy of your ETT consent form.`,
      to: [ emailAddress ],
      pdfAttachments: [
        {
          pdf: new ConsentForm({ consenter, entityName, privacyHref }),
          name: 'consent-form.pdf',
          description: 'consent-form.pdf'
        }
      ]  
    });
  }
}



/**
 * RUN MANUALLY: Modify email as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/consenting-person/ConsentEmail.ts')) {
  const email = process.env.PDF_RECIPIENT_EMAIL;
  
  if( ! email) {
    console.log('Email environment variable is missing. Put PDF_RECIPIENT_EMAIL=[email] in .env in ${workspaceFolder}');
    process.exit(1);
  }

  const test_consenter_form_data = {
    entityName: 'Boston University',
    consenter: {
      email, active: YN.Yes, consented_timestamp: [ new Date().toISOString() ],
      firstname: 'Bugs', middlename: 'B', lastname: 'Bunny', title: 'Rabbit',
      phone_number: '+617-222-4444', 
    }
  } as ConsentFormData;

  new ConsentFormEmail(test_consenter_form_data).send()
    .then(success => {
      console.log(success ? 'Succeeded' : 'Failed');
    })
    .catch(e => {
      console.error(e);
    });
}