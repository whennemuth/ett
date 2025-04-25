import * as ctx from '../../../../contexts/context.json';
import { IContext } from "../../../../contexts/IContext";
import { DAOFactory } from "../../_lib/dao/dao";
import { UserCrud } from '../../_lib/dao/dao-user';
import { Consenter, Delegate, Entity, ExhibitFormConstraints, ExhibitForm as ExhibitFormData, Role, Roles, User, YN } from "../../_lib/dao/entity";
import { EmailParms, sendEmail } from "../../_lib/EmailWithAttachments";
import { ConsentForm, ConsentFormData } from "../../_lib/pdf/ConsentForm";
import { DisclosureForm, DisclosureFormData } from "../../_lib/pdf/DisclosureForm";
import { ExhibitFormParms, getSampleAffiliates, SampleExhibitFormParms } from "../../_lib/pdf/ExhibitForm";
import { ExhibitFormSingleBoth } from '../../_lib/pdf/ExhibitFormSingleBoth';
import { ExhibitFormSingleCurrent } from '../../_lib/pdf/ExhibitFormSingleCurrent';
import { ExhibitFormSingleOther } from '../../_lib/pdf/ExhibitFormSingleOther';
import { IPdfForm, PdfForm } from "../../_lib/pdf/PdfForm";
import { log } from '../../Utils';
import { DisclosureItemsParms } from "../consenting-person/BucketItem";
import { BucketDisclosureForm } from "../consenting-person/BucketItemDisclosureForm";
import { BucketExhibitForm } from "../consenting-person/BucketItemExhibitForm";
import { BucketItemMetadata } from "../consenting-person/BucketItemMetadata";
import { consentFormUrl } from '../consenting-person/ConsentingPersonUtils';
import { BucketCorrectionForm } from '../consenting-person/correction/BucketItemCorrectionForm';
import { abrahamlincoln, alberteinstein, bingcrosby, bugsbunny, elvispresley } from "./MockObjects";


export type DisclosureEmailParms = DisclosureItemsParms & {
  emailType?: 'request' | 'reminder'
}

export type Recipients = {
  to:string[], cc:string[], bcc:string[]
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

  public send = async (recipients:Recipients):Promise<boolean> => {
    return grabFromBucketAndSend(this.parms, recipients)
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

  public send = async (recipients:Recipients):Promise<boolean> => {
    return grabFromBucketAndSend(this.parms, recipients)
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

  public send = async (recipients:Recipients):Promise<boolean> => { 
    const { 
      exhibitData, exhibitData: { constraint, affiliates=[] }, data, data: { 
        consenter, 
        consenter: { email:consenterEmail }, 
        requestingEntity: { name:entity_name },
        disclosingEntity: { representatives }
      } 
    } = this;
    const { BOTH, CURRENT, OTHER } = ExhibitFormConstraints;

    // Email attachments
    const affiliateEmail = recipients.to[0];
    const parms = {
      consenter, consentFormUrl: consentFormUrl(consenterEmail), data:exhibitData, entity: { entity_id:'abc123', entity_name }
    } as ExhibitFormParms;
    const affiliateMatch = affiliates.find(a => {
      return a.email == affiliateEmail;
    });

    if( ! affiliateMatch) {
      console.error(`Cannot send disclosure request email: Affiliate email ${affiliateEmail} not found in exhibit form`);
      return false;
    }

    let singleExhibitForm:IPdfForm;
    switch(constraint) {
      case BOTH:
        singleExhibitForm = ExhibitFormSingleBoth.getInstance(parms);
        break;
      case CURRENT:
        singleExhibitForm = ExhibitFormSingleCurrent.getInstance(parms);
        break;
      case OTHER:
        singleExhibitForm = ExhibitFormSingleOther.getInstance(parms);
        break;
    }

    const disclosureForm = new DisclosureForm(data);

    return send({ 
      recipients, consenter, consenterEmail, emailType:'request', disclosureForm, singleExhibitForm, entity_name, correctionForms: []
    });
  }
}

export class RecipientListGenerator {
  private entity_id: string;
  private affiliateEmail: string | undefined;
  private emailType: string;

  /**
   * @param disclosureEmailParms The parameters for identifying the disclosure form in the bucket
   */
  constructor(disclosureEmailParms:DisclosureEmailParms) {
    const { s3ObjectKeyForDisclosureForm, s3ObjectKeyForExhibitForm, emailType } = disclosureEmailParms;
    const dfMetadata = BucketItemMetadata.fromBucketObjectKey(s3ObjectKeyForDisclosureForm);
    const efMetadata = BucketItemMetadata.fromBucketObjectKey(s3ObjectKeyForExhibitForm);
    this.entity_id = dfMetadata?.entityId ?? efMetadata?.entityId;
    this.affiliateEmail = dfMetadata?.affiliateEmail ?? efMetadata?.affiliateEmail;
    this.emailType = emailType ?? 'request';
  }

  public generate = async ():Promise<Recipients> => {
    const { entity_id, affiliateEmail, emailType } = this;
    // Get all users for the entity
    const users = (await UserCrud({ userinfo: { entity_id } as User }).read() as User[])
      .filter(user => user.active == YN.Yes);

    // Construct a recipient list for the disclosure request email
    const emailMapper = (user:User, role:Role):string|undefined => {
      if(user.role == role && user.active == YN.Yes) {
        const { email, delegate={} as Delegate } = user;
        if(delegate.email) {
          return delegate.email;
        }
        return email;
      }
      return undefined;
    }

    switch(emailType) {
      case 'reminder':
        return { to: [ affiliateEmail ] } as Recipients
      case 'request': default:
        return {
          to: [ affiliateEmail ],
          cc: users.map(user => emailMapper(user, Roles.RE_AUTH_IND)).filter(email => email != undefined),
          bcc: users.map(user => emailMapper(user, Roles.RE_ADMIN)).filter(email => email != undefined)
        } as Recipients
    }
  }
}

/**
 * Retrieve the exhibit & disclosure forms from the s3 bucket and send them as attachments in a disclosure
 * request email.
 * @param parms 
 * @returns 
 */
const grabFromBucketAndSend = async (parms:DisclosureEmailParms, recipients:Recipients):Promise<boolean> => {
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
    writeToDisk(path: string): Promise<void> {
      throw new Error('Method not implemented.');
    }
    async getBytes(): Promise<Uint8Array> {
      return new BucketExhibitForm(s3ObjectKeyForExhibitForm).get();
    }
  }();

  // Get the disclosure form
  const disclosureForm = new class implements IPdfForm {
    writeToDisk(path: string): Promise<void> {
      throw new Error('Method not implemented.');
    }
    async getBytes(): Promise<Uint8Array> {
      return new BucketDisclosureForm({ metadata: s3ObjectKeyForDisclosureForm }).get();
    }
  }();

  // Get the consenter correction forms
  const correctionFormsBytes = await BucketCorrectionForm.getAll(consenterEmail, savedDate);
  const correctionForms = correctionFormsBytes.map(bytes => {
    return new class implements IPdfForm {
      writeToDisk(path: string): Promise<void> {
        throw new Error('Method not implemented.');
      }
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
    recipients, consenterEmail, emailType, disclosureForm, singleExhibitForm, correctionForms, entity_name 
  });
}

type EmailParameters = {
  recipients:Recipients,
  consenterEmail:string,
  consenter?:Consenter, 
  emailType?:string, 
  disclosureForm:IPdfForm, 
  singleExhibitForm:IPdfForm, 
  correctionForms:IPdfForm[],
  entity_name:string
}
/**
 * Send the disclosure request/reminder email
 * @param parms 
 * @returns 
 */
const send = async (parms:EmailParameters):Promise<boolean> => {
  let { recipients, consenterEmail, consenter, emailType, entity_name, disclosureForm, singleExhibitForm, correctionForms } = parms;

  if( ! consenter) {
    // Lookup the consenter in the database
    const consenterDao = DAOFactory.getInstance({ DAOType: 'consenter', Payload: { email: consenterEmail} as Consenter});
    consenter = await consenterDao.read() as Consenter;
    if( ! consenter) {
      console.error(`Cannot send disclosure ${emailType} email: Consenter not found`);
      return false;
    }
  }
  const { firstname, middlename, lastname } = consenter ?? {};
  const { fullName } = PdfForm;
  const consenterFullName = fullName(firstname, middlename, lastname);
  const context:IContext = <IContext>ctx;
  const privacyHref = `https://${process.env.CLOUDFRONT_DOMAIN}${context.PRIVACY_POLICY_PATH}`;
  const dashboardHref = `https://${process.env.CLOUDFRONT_DOMAIN}${context.CONSENTING_PERSON_PATH}`;

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
      pdf: new ConsentForm({ consenter: consenter as Consenter, entityName: entity_name, privacyHref, dashboardHref } as ConsentFormData),
      name: 'consent-form.pdf',
      description: 'consent-form.pdf',
    }
  ];

  for(let i=0; i<correctionForms.length; i++) {
    attachments.push({
      pdf: correctionForms[i],
      name: `correction-form-${i+1}`,
      description: `correction-form-${i+1}`
    })
  };

  const { to, cc=[], bcc=[] } = recipients;

  return sendEmail({
    subject: `ETT Disclosure ${emailType}`,
    from: `noreply@${context.ETT_DOMAIN}`,
    message: `Please find enclosed a disclosure form from ${entity_name}, including a consent form from ` +
      `${consenterFullName} who is the subject of the disclosure and their original exhibit form ` +
      `naming you to disclose.`,
    to, cc, bcc,
    pdfAttachments: attachments
  } as EmailParms);
}



/**
 * RUN MANUALLY: Modify email as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/authorized-individual/DisclosureRequestEmail.ts')) {
  
  // Make this an actual email address that SES will reach.
  const affiliateEmail = process.env.PDF_RECIPIENT_EMAIL;
  
  if( ! affiliateEmail) {
    log('Email environment variable is missing. Put PDF_RECIPIENT_EMAIL=[email] in .env in ${workspaceFolder}');
    process.exit(1);
  }

  const test_disclosure_data = {
    consenter: { 
      email: 'cp1@warhen.work', phone_number: '617-222-4444', active: YN.Yes,
      firstname: 'Richard', middlename: 'F', lastname: 'Nixon', consented_timestamp: [ new Date().toISOString() ]
    },
    disclosingEntity: { name: 'Boston University', representatives: [ alberteinstein, elvispresley ] },
    requestingEntity: { name: 'Northeastern University', authorizedIndividuals: [ abrahamlincoln, bingcrosby ] }
  } as DisclosureFormData;
  
  const test_data = SampleExhibitFormParms([ getSampleAffiliates().employerPrimary ]).data;
  const test_exhibit_data = Object.assign({}, test_data) ?? {};
  // Make sure email address to send to matches one of the affiliates in the exhibit form test data, so validation will pass.
  if(test_exhibit_data.affiliates && test_exhibit_data.affiliates.length > 0) {
    test_exhibit_data.affiliates[0].email = affiliateEmail;
  }

  const recipients = {
    to: [ affiliateEmail ],
    cc: [ abrahamlincoln.email, bingcrosby.email ], // 2 ai's
    bcc: [ bugsbunny.email ] // asp
  } as Recipients;

  new BasicDisclosureRequest(test_disclosure_data, test_exhibit_data).send(recipients)
    .then(success => {
      log(success ? 'Succeeded' : 'Failed');
    })
    .catch(e => {
      console.error(e);
    });
    
}