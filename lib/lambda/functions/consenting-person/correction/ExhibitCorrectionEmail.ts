import * as ctx from '../../../../../contexts/context.json';
import { IContext } from "../../../../../contexts/IContext";
import { ConsenterCrud } from "../../../_lib/dao/dao-consenter";
import { EntityCrud } from "../../../_lib/dao/dao-entity";
import { UserCrud } from "../../../_lib/dao/dao-user";
import { AffiliateTypes, Consenter, Entity, Roles, User, YN } from "../../../_lib/dao/entity";
import { Attachment, EmailParms, sendEmail } from "../../../_lib/EmailWithAttachments";
import { ExhibitForm } from "../../../_lib/pdf/ExhibitForm";
import { ExhibitFormSingle } from "../../../_lib/pdf/ExhibitFormSingle";
import { IPdfForm, PdfForm } from "../../../_lib/pdf/PdfForm";
import { ExhibitFormCorrection } from "../ConsentingPerson";


/**
 * This class represents an email issued to the representatives of an entity to inform them of corrections that
 * a consenting individual has made to one or more affiliates in their exhibit form
 */
export class ExhibitCorrectionEmail {
  private context:IContext;
  private corrections:ExhibitFormCorrection;
  private entity:Entity;
  private consenterEmail:string;
  private consenter:Consenter;
  private pdf:IPdfForm;

  constructor(consenterEmail:string, corrections:ExhibitFormCorrection) {
    this.consenterEmail = consenterEmail;
    this.corrections = corrections;
    this.context = <IContext>ctx;
  }

  private initialize = async ():Promise<void> => {
    const { consenter, consenterEmail, corrections:{ entity_id } } = this;
    if( ! this.consenter) {
      this.consenter = await ConsenterCrud({ email:consenterEmail} as Consenter).read() as Consenter;
    }
    if( ! this.entity) {
      this.entity = await EntityCrud({ entity_id } as Entity).read() as Entity;
    }
  }

  public sendToEntity = async ():Promise<boolean> => {
    const { context, initialize, corrections: { appends=[], deletes=[], updates=[] } } = this;

    await initialize();

    const { consenter, consenter: { firstname, middlename, lastname }, entity: { entity_id, entity_name } } = this;
    const { fullName } = PdfForm;
    const consenterFullname = fullName(firstname, middlename, lastname);
    const subject = 'ETT Notice of Exhibit Form Correction';
    let message = `Consenting individual ${consenterFullname} has corrected an exhibit form that was previously submitted to ${entity_name}.`

    // Build a list of what's changed into the email message
    message += '<p><ul>';
    deletes.forEach(affiliateEmail => {
      message += `<li>${affiliateEmail} has been removed</li>`
    });
    updates.forEach(affiliate => {
      message += `<li>${affiliate.email} (${affiliate.fullname} has been updated)</li>`
    });
    appends.forEach(affiliate => {
      message += `<li>${affiliate.email} (${affiliate.fullname} has been added)</li>`
    });
    message +='</ul></p>';

    // Build the pdf attachment(s)
    const attachments = [] as Attachment[];
    let counter = 0;

    // Build the attachments for affiliate updates
    updates.forEach(affiliate => {
      const name = `corrected-affiliate-${++counter}.pdf`;
      attachments.push({ 
        name, 
        description: name, 
        pdf: new ExhibitFormSingle(new ExhibitForm({
          entity_id, affiliates: [ affiliate ]
        }), consenter, affiliate.email) 
      });
    });

    // Build the attachments for new affiliates
    counter = 0;
    appends.forEach(affiliate => {
      const name = `new-affiliate-${++counter}.pdf`;
      attachments.push({ 
        name, 
        description: name, 
        pdf: new ExhibitFormSingle(new ExhibitForm({
          entity_id, affiliates: [ affiliate ]
        }), consenter, affiliate.email) 
      });
    });

    // Get the email recipients
    const users = (await UserCrud({ entity_id } as User).read() ?? []) as User[];

    // Get the first AI of the entity as the "to" addressee
    const firstAI = users.find(user => user.active == YN.Yes && user.role == Roles.RE_AUTH_IND);
    if( ! firstAI) {
      console.warn(`Could not find an active authorized individual for entity: ${entity_id}`);
      return false;
    }

    // Get the admin of the entity as the bcc addressee.
    const bcc = users.map(user => { 
      return (user.role == Roles.RE_ADMIN && user.active == YN.Yes) ? user.email : undefined
    }).filter(email => email != undefined) as string[];

    // Get the other AI of the entity as a cc addressee.
    const cc = users.map(user => {
      return (user.role == Roles.RE_AUTH_IND && user.active == YN.Yes) ? user.email : undefined
    }).filter(email => email != undefined && email != firstAI.email) as string[];

    // Send the email
    console.log(`Sending exhibit form correction email to entity reps`);
    const from = `noreply@${context.ETT_DOMAIN}`;
    return sendEmail({ subject, from, message, to: [ firstAI.email ], cc, bcc, attachments } as EmailParms);
  }

  public sendToAffiliates = async ():Promise<boolean> => {
    const { context, initialize, corrections: { appends=[], deletes=[], updates=[] } } = this;

    await initialize();
    
    const { consenter, consenter: { firstname, middlename, lastname }, entity: { entity_id, entity_name } } = this;
    const { fullName } = PdfForm;
    const consenterFullname = fullName(firstname, middlename, lastname);
    const subject = 'ETT Notice of Consent Revision';
    let message = `Consenting individual ${consenterFullname} has made corrections to your details in their exhibit form for ${entity_name}.`

    let allOk:boolean = true;
    for(let i=0; i<updates.length; i++) {
      const { email } = updates[i];

      // Log what's about to happen
      console.log(`Sending exhibit form correction email to affiliate: ${email}`);

      // Send the email
      const from = `noreply@${context.ETT_DOMAIN}`;
      const ok = await sendEmail({ subject, from, message, to: [ email ], attachments: [
        { 
          name: 'correction.pdf', 
          description: 'correction.pdf', 
          pdf: new ExhibitFormSingle(new ExhibitForm({
            entity_id, affiliates: [ updates[i] ]
          }), consenter, email) 
        }
      ] } as EmailParms);
      allOk &&= ok;
    }

    return allOk;
  }

  public getAttachment = ():IPdfForm => {
    return this.pdf;
  }
}



/**
 * RUN MANUALLY: Modify consenter, entity_id
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/consenting-person/correction/ExhibitCorrectionEmail.ts')) {

  const { ACADEMIC, EMPLOYER, OTHER } = AffiliateTypes;
  const correctionEmail = new ExhibitCorrectionEmail('cp2@warhen.work', {
    entity_id: 'eea2d463-2eab-4304-b2cf-cf03cf57dfaa',
    appends: [
      { 
        affiliateType:OTHER, 
        email:'affiliate1@warhen.work', 
        fullname:'Flash Gordon', 
        org: 'The planetary defense institute', 
        phone_number: '1234567890', 
        title: 'Sky Captain' 
      },
    ],
    updates: [
      {
        affiliateType: EMPLOYER,
        email: 'affiliate2@warhen.work',
        fullname: 'Janis Joplin',
        org: 'Big Brother and the Holding Company',
        phone_number: '0987654321',
        title: 'Song Writer'
      },
      {
        affiliateType: ACADEMIC,
        email: 'affiliate3@warhen.work',
        fullname: 'Mick Jagger',
        org: 'The Rolling Stones',
        phone_number: '2223334444',
        title: 'Singer/Song Writer'
      }
    ],
    deletes: [
      'random.email@randomorg.edu',
      'bogus.email@bogusorg.com'
    ]
  });

  (async ()=> {
    if( await correctionEmail.sendToEntity()) {
      correctionEmail.sendToAffiliates();
    }
  })();
}