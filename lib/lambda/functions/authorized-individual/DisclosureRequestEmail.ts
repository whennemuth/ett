import { DisclosureForm, DisclosureFormData } from "../../_lib/pdf/DisclosureForm";
import { sendEmail } from "../EmailWithAttachments";
import { bugsbunny, daffyduck, yosemitesam } from "./MockObjects";
import { test_data as test_exhibit_data } from '../consenting-person/ExhibitEmail';
import { ExhibitFormSingle } from '../../_lib/pdf/ExhibitFormSingle'
import { ExhibitForm as ExhibitFormData } from "../../_lib/dao/entity";
import { ExhibitForm } from "../../_lib/pdf/ExhibitForm";

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
    const { data, exhibitData, data: { requestingEntity: { name:entity }}, data: { consenter: { fullname }} } = this;

    return await sendEmail({
      subject: 'ETT Disclosure Request',
      message: `Please find enclosed a disclosure form from ${entity}, including a consent form from ` +
        `${fullname} who is the subject of the disclosure and their original original exhibit form ` +
        `naming you to disclose.`,
      emailAddress,
      attachments: [
        {
          pdf: new DisclosureForm(data),
          name: 'disclosure-form.pdf',
          description: 'disclosure-form.pdf'
        },
        {
          pdf: new ExhibitFormSingle(new ExhibitForm(exhibitData), data.consenter),
          name: 'exhibit-form-single.pdf',
          description: 'exhibit-form-single.pdf'
        },
        // TODO: Add consent form to this array
      ]  
    });
  }
}



/**
 * RUN MANUALLY: Modify the task, landscape, email, role, & entity_id as needed.
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
      email: 'foghorn@warnerbros.com', phone_number: '617-222-4444', fullname: 'Foghorn Leghorn' },
      disclosingEntity: { name: 'Boston University', representatives: [ daffyduck, yosemitesam ] },
      requestingEntity: { name: 'Northeastern University', authorizedIndividuals: [ bugsbunny ]
    }
  } as DisclosureFormData;

  new DisclosureRequestEmail(test_disclosure_data, test_exhibit_data).send(email)
    .then(success => {
      console.log(success ? 'Succeeded' : 'Failed');
    })
    .catch(e => {
      console.error(e);
    });
    
}