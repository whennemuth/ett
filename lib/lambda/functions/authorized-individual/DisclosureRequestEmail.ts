import * as ctx from '../../../../contexts/context.json';
import { IContext } from "../../../../contexts/IContext";
import { DAOFactory } from "../../_lib/dao/dao";
import { Consenter, Entity, ExhibitForm as ExhibitFormData, YN } from "../../_lib/dao/entity";
import { EmailParms, sendEmail } from "../../_lib/EmailWithAttachments";
import { ConsentForm } from "../../_lib/pdf/ConsentForm";
import { DisclosureForm, DisclosureFormData } from "../../_lib/pdf/DisclosureForm";
import { ExhibitForm } from "../../_lib/pdf/ExhibitForm";
import { ExhibitFormSingle } from '../../_lib/pdf/ExhibitFormSingle';
import { IPdfForm, PdfForm } from "../../_lib/pdf/PdfForm";
import { BucketCorrectionForm } from '../consenting-person/correction/BucketItemCorrectionForm';
import { DisclosureItemsParms } from "../consenting-person/BucketItem";
import { BucketDisclosureForm } from "../consenting-person/BucketItemDisclosureForm";
import { BucketExhibitForm } from "../consenting-person/BucketItemExhibitForm";
import { BucketItemMetadata } from "../consenting-person/BucketItemMetadata";
import { test_data as test_exhibit_data } from '../consenting-person/ExhibitEmail';
import { bugsbunny, daffyduck, yosemitesam } from "./MockObjects";
import { log } from '../../Utils';


export type DisclosureEmailParms = DisclosureItemsParms & {
  emailType?: 'request' | 'reminder'
}

/**
 * This class represents an email that is issued to an affilliate for soliciting disclosure information.
 * Included in the email are 3 attachments: 1) Disclosure form, single exhibit form, consent form.
 */
export class DisclosureRequestEmail {
  private parms:DisclosureEmailParms;

  constructor(parms:DisclosureEmailParms) {
    this.parms = parms;
    this.parms.emailType = "request";   
  }

  public send = async ():Promise<boolean> => {
    return grabFromBucketAndSend(this.parms)
  }
}

/**
 * This class represents an email that is issued to an affilliate as a reminder to disclose.
 * Included in the email are 3 attachments: 1) Disclosure form, single exhibit form, consent form.
 */
export class DisclosureRequestReminderEmail {
  private parms:DisclosureEmailParms;

  constructor(parms:DisclosureEmailParms) {
    this.parms = parms;
    this.parms.emailType = "reminder";   
  }

  public send = async ():Promise<boolean> => {
    return grabFromBucketAndSend(this.parms)
  }
}

/**
 * This is a shortcut for sending a disclosure request without having to retrieve attachments from
 * the s3 bucket - the exhibit and disclosure forms are rendered dynamically. Used for testing as there
 * is no real scenario in which disclosure requests are sent without retrieving items from the bucket.
 */
export class BasicDisclosureRequest {
  private data:DisclosureFormData;
  private exhibitData:ExhibitFormData;

  constructor(data:DisclosureFormData, exhibitData:ExhibitFormData) {
    this.data = data;
    this.exhibitData = exhibitData;
  }

  public send = async (emailAddress:string):Promise<boolean> => { 
    const { 
      exhibitData, data, data: { 
        consenter, 
        consenter: { email:consenterEmail }, 
        requestingEntity: { name:entity_name },
        disclosingEntity: { representatives }
      } 
    } = this;

    // Email attachments
    const affiliateEmail = representatives[0].email;  
    const singleExhibitForm = new ExhibitFormSingle(new ExhibitForm(exhibitData), consenter, emailAddress);
    const disclosureForm = new DisclosureForm(data);

    return send({ 
      consenterEmail, emailType:'request', disclosureForm, singleExhibitForm, affiliateEmail, entity_name, correctionForms: []
    });
  }
}

/**
 * Retrieve the exhibit & disclosure forms from the s3 bucket and send them as attachments in a disclosure
 * request email.
 * @param parms 
 * @returns 
 */
const grabFromBucketAndSend = async (parms:DisclosureEmailParms):Promise<boolean> => {
  const { consenterEmail, s3ObjectKeyForExhibitForm, s3ObjectKeyForDisclosureForm, emailType } = parms;
  log({ 
    consenterEmail, 
    s3ObjectKeyForExhibitForm,
    s3ObjectKeyForDisclosureForm
  }, `Sending disclosure ${emailType}`);

  const { entityId, affiliateEmail, savedDate } = BucketItemMetadata.fromBucketObjectKey(s3ObjectKeyForExhibitForm) ?? {};
  if( ! affiliateEmail) {
    console.error(`Cannot send disclosure ${emailType} email: Affiliate email unknown`);
    return false;
  }

  // Get the exhibit form
  const singleExhibitForm = new class implements IPdfForm {
    async getBytes(): Promise<Uint8Array> {
      return new BucketExhibitForm(s3ObjectKeyForExhibitForm).get();
    }
  }();

  // Get the disclosure form
  const disclosureForm = new class implements IPdfForm {
    async getBytes(): Promise<Uint8Array> {
      return new BucketDisclosureForm({ metadata: s3ObjectKeyForDisclosureForm }).get();
    }
  }();

  // Get the consenter correction forms
  const correctionFormsBytes = await BucketCorrectionForm.getAll(consenterEmail, savedDate);
  const correctionForms = correctionFormsBytes.map(bytes => {
    return new class implements IPdfForm {
      async getBytes(): Promise<Uint8Array> {
        return bytes;
      }
    }()
  });

  // Get the entity
  const entityDao = DAOFactory.getInstance({ DAOType: 'entity', Payload: { entity_id:entityId} as Entity });
  const entity = await entityDao.read() as Entity;
  const { entity_name} = entity;

  return send({ 
    consenterEmail, emailType, disclosureForm, singleExhibitForm, affiliateEmail, correctionForms, entity_name 
  });
}

type EmailParameters = {
  consenterEmail:string, 
  emailType?:string, 
  disclosureForm:IPdfForm, 
  singleExhibitForm:IPdfForm, 
  correctionForms:IPdfForm[],
  affiliateEmail:string, 
  entity_name:string
}
/**
 * Send the disclosure request/reminder email
 * @param parms 
 * @returns 
 */
const send = async (parms:EmailParameters):Promise<boolean> => {
  const { consenterEmail, emailType, entity_name, affiliateEmail, disclosureForm, singleExhibitForm, correctionForms } = parms;

  // Get the consenter
  const consenterDao = DAOFactory.getInstance({ DAOType: 'consenter', Payload: { email: consenterEmail} as Consenter});
  const consenter = await consenterDao.read() as Consenter;
  const { firstname, middlename, lastname } = consenter;
  const { fullName } = PdfForm;
  const consenterFullName = fullName(firstname, middlename, lastname);
  const context:IContext = <IContext>ctx;

  const attachments = [
    {
      pdf: disclosureForm,
      name: 'disclosure-form.pdf',
      description: 'disclosure-form.pdf'
    },
    {
      pdf: singleExhibitForm,
      name: 'exhibit-form-single.pdf',
      description: 'exhibit-form-single.pdf'
    },
    {
      pdf: new ConsentForm({ consenter, entityName:entity_name }),
      name: 'consent-form.pdf',
      description: 'consent-form.pdf'
    }
  ];

  for(let i=0; i<correctionForms.length; i++) {
    attachments.push({
      pdf: correctionForms[i],
      name: `correction-form-${i+1}`,
      description: `correction-form-${i+1}`
    })
  };

  return sendEmail({
    subject: `ETT Disclosure ${emailType}`,
    from: `noreply@${context.ETT_DOMAIN}`,
    message: `Please find enclosed a disclosure form from ${entity_name}, including a consent form from ` +
      `${consenterFullName} who is the subject of the disclosure and their original exhibit form ` +
      `naming you to disclose.`,
    to: [ affiliateEmail ],
    attachments
  } as EmailParms);
}



/**
 * RUN MANUALLY: Modify email as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/authorized-individual/DisclosureRequestEmail.ts')) {
  const email = process.env.PDF_RECIPIENT_EMAIL;
  
  if( ! email) {
    log('Email environment variable is missing. Put PDF_RECIPIENT_EMAIL=[email] in .env in ${workspaceFolder}');
    process.exit(1);
  }

  const test_disclosure_data = {
    consenter: { 
      email: 'foghorn@warnerbros.com', phone_number: '617-222-4444', active: YN.Yes,
      firstname: 'Foghorn', middlename: 'F', lastname: 'Leghorn', consented_timestamp: [ new Date().toISOString() ]
    },
    disclosingEntity: { name: 'Boston University', representatives: [ daffyduck, yosemitesam ] },
    requestingEntity: { name: 'Northeastern University', authorizedIndividuals: [ bugsbunny ] }
  } as DisclosureFormData;

  new BasicDisclosureRequest(test_disclosure_data, test_exhibit_data).send(email)
    .then(success => {
      log(success ? 'Succeeded' : 'Failed');
    })
    .catch(e => {
      console.error(e);
    });
    
}