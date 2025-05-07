import * as ctx from '../../../../contexts/context.json';
import { IContext } from "../../../../contexts/IContext";
import { YN } from "../../_lib/dao/entity";
import { sendEmail } from "../../_lib/EmailWithAttachments";
import { ConsentFormData } from "../../_lib/pdf/ConsentForm";
import { PdfForm } from "../../_lib/pdf/PdfForm";
import { RegistrationFormIndividual } from "../../_lib/pdf/RegistrationFormIndividual";

export type IndividualRegistrationFormData = ConsentFormData & {
  loginHref?:string
}

/**
 * This class represents an email that is issued to a recipient who has requested a copy of a consenters
 * consent form.
 */
export class IndividualRegistrationFormEmail {
  private data:IndividualRegistrationFormData;

  constructor(data:IndividualRegistrationFormData) {
    this.data = data;
  }

  public send = async (emailAddress?:string):Promise<boolean> => {
    const { data: { consenter, consenter: { email, firstname, middlename, lastname }, loginHref }} = this;
    const { fullName } = PdfForm;
    const consenterFullName = fullName(firstname, middlename, lastname);
    emailAddress = emailAddress ?? email;
    const context:IContext = <IContext>ctx;

    return await sendEmail({
      subject: 'ETT Individual Registration Form',
      from: `noreply@${context.ETT_DOMAIN}`, 
      message: 
        `Greetings ${consenterFullName}.<br>` +
        `Thank you for registering with ETT.<br>` +
        `Please find enclosed a pdf copy of your ETT registration form.`,
      to: [ emailAddress ],
      pdfAttachments: [
        {
          pdf: new RegistrationFormIndividual(consenter, loginHref),
          name: 'registration-form.pdf',
          description: 'registration-form.pdf'
        }
      ]  
    });
  }
}



/**
 * RUN MANUALLY: Modify email as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/consenting-person/RegistrationEmail.ts')) {
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
      create_timestamp: new Date().toISOString()
    },
    loginHref: 'https://www.example.com/login'
  } as IndividualRegistrationFormData;

  new IndividualRegistrationFormEmail(test_consenter_form_data).send()
    .then(success => {
      console.log(success ? 'Succeeded' : 'Failed');
    })
    .catch(e => {
      console.error(e);
    });
}