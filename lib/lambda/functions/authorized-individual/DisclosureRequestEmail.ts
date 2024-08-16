import { ExhibitForm as ExhibitFormData, YN } from "../../_lib/dao/entity";
import { ConsentForm } from "../../_lib/pdf/ConsentForm";
import { DisclosureForm, DisclosureFormData } from "../../_lib/pdf/DisclosureForm";
import { ExhibitForm } from "../../_lib/pdf/ExhibitForm";
import { ExhibitFormSingle } from '../../_lib/pdf/ExhibitFormSingle';
import { PdfForm } from "../../_lib/pdf/PdfForm";
import { sendEmail } from "../EmailWithAttachments";
import { test_data as test_exhibit_data } from '../consenting-person/ExhibitEmail';
import { bugsbunny, daffyduck, yosemitesam } from "./MockObjects";

/**
 * This class represents an email that is issued to an affilliate for soliciting disclosure information.
 * Included in the email are 3 attachments: 1) Disclosure form, single exhibit form, consent form.
 */
export class DisclosureRequestEmail {
  private data:DisclosureFormData;
  private exhibitData:ExhibitFormData;

  constructor(data:DisclosureFormData, exhibitData:ExhibitFormData ) {
    this.data = data;
    this.exhibitData = exhibitData;
  }

  public send = async (emailAddress:string):Promise<boolean> => { 
    const { data, exhibitData, data: { requestingEntity: { name:entityName }}, 
      data: { consenter, consenter: { firstname, middlename, lastname}} } = this;
    const { fullName } = PdfForm;
    const consenterFullName = fullName(firstname, middlename, lastname);

    return await sendEmail({
      subject: 'ETT Disclosure Request',
      message: `Please find enclosed a disclosure form from ${entityName}, including a consent form from ` +
        `${consenterFullName} who is the subject of the disclosure and their original original exhibit form ` +
        `naming you to disclose.`,
      emailAddress,
      attachments: [
        {
          pdf: new DisclosureForm(data),
          name: 'disclosure-form.pdf',
          description: 'disclosure-form.pdf'
        },
        {
          pdf: new ExhibitFormSingle(new ExhibitForm(exhibitData), consenter, emailAddress),
          name: 'exhibit-form-single.pdf',
          description: 'exhibit-form-single.pdf'
        },
        {
          pdf: new ConsentForm({ consenter, entityName }),
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
if(args.length > 2 && args[2] == 'RUN_MANUALLY_SEND_DISCLOSURE_FORM') {
  const email = process.env.PDF_RECIPIENT_EMAIL;
  
  if( ! email) {
    console.log('Email environment variable is missing. Put PDF_RECIPIENT_EMAIL=[email] in .env in ${workspaceFolder}');
    process.exit(1);
  }

  const test_disclosure_data = {
    consenter: { 
      email: 'foghorn@warnerbros.com', phone_number: '617-222-4444', active: YN.Yes,
      firstname: 'Foghorn', middlename: 'F', lastname: 'Leghorn', consented_timestamp: new Date().toISOString()
    },
    disclosingEntity: { name: 'Boston University', representatives: [ daffyduck, yosemitesam ] },
    requestingEntity: { name: 'Northeastern University', authorizedIndividuals: [ bugsbunny ] }
  } as DisclosureFormData;

  new DisclosureRequestEmail(test_disclosure_data, test_exhibit_data).send(email)
    .then(success => {
      console.log(success ? 'Succeeded' : 'Failed');
    })
    .catch(e => {
      console.error(e);
    });
    
}