import * as ctx from '../../../../contexts/context.json';
import { IContext } from "../../../../contexts/IContext";
import { YN } from "../../_lib/dao/entity";
import { sendEmail } from "../../_lib/EmailWithAttachments";
import { ConsentForm, ConsentFormData } from "../../_lib/pdf/ConsentForm";
import { PdfForm } from "../../_lib/pdf/PdfForm";
import { FormName, getPublicFormApiUrl } from "../public/FormsDownload";

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
    const { ETT_DOMAIN, PATHS: {
      PRIVACY_POLICY_PATH, CONSENTING_PERSON_PATH,  ENTITY_INVENTORY_PATH, CONSENTING_PERSON_REGISTRATION_PATH 
    }} = context;
    const { CLOUDFRONT_DOMAIN:domain } = process.env;
    const privacyHref = `https://${domain}${PRIVACY_POLICY_PATH}`;
    const dashboardHref = `https://${domain}${CONSENTING_PERSON_PATH}`;

    return await sendEmail({
      subject: 'ETT Individual Consent Form',
      from: `noreply@${context.ETT_DOMAIN}`, 
      message:  
        `Greetings ${consenterFullName}.<br>` +
        `Thank you for granting consent for disclosures with ETT.<br>` +
        `Please find enclosed a pdf copy of your ETT consent form.`,
      to: [ emailAddress ],
      pdfAttachments: [
        {
          pdf: new ConsentForm({ 
            consenter, 
            entityName, 
            privacyHref, 
            dashboardHref,
            exhibitFormLink: getPublicFormApiUrl(FormName.EXHIBIT_FORM_BOTH_FULL),
            disclosureFormLink: getPublicFormApiUrl(FormName.DISCLOSURE_FORM),
            entityInventoryLink: `https://${domain}${ENTITY_INVENTORY_PATH}`
          }),
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