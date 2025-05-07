import * as ctx from '../../../../../contexts/context.json';
import { IContext } from "../../../../../contexts/IContext";
import { ConsenterCrud } from "../../../_lib/dao/dao-consenter";
import { EntityCrud } from "../../../_lib/dao/dao-entity";
import { UserCrud } from "../../../_lib/dao/dao-user";
import { Affiliate, AffiliateTypes, Consenter, Entity, ExhibitFormConstraints, FormTypes, roleFullName, Roles, User, YN } from "../../../_lib/dao/entity";
import { PdfAttachment, EmailParms, sendEmail } from "../../../_lib/EmailWithAttachments";
import { ExhibitForm, ExhibitFormParms } from "../../../_lib/pdf/ExhibitForm";
import { ExhibitFormSingleBoth } from '../../../_lib/pdf/ExhibitFormSingleBoth';
import { ExhibitFormSingleCurrent } from '../../../_lib/pdf/ExhibitFormSingleCurrent';
import { IPdfForm, PdfForm } from "../../../_lib/pdf/PdfForm";
import { consentFormUrl } from '../ConsentingPersonUtils';
import { ExhibitFormCorrection } from '../ExhibitCorrect';


/**
 * This class represents an email issued to the representatives of an entity to inform them of corrections that
 * a consenting individual has made to one or more affiliates in their exhibit form
 */
export class ExhibitCorrectionEmail {
  private context:IContext;
  private corrections:ExhibitFormCorrection;
  private consenterEmail:string;
  private _entity:Entity;
  private _consenter:Consenter;
  private _users:User[];
  private pdf:IPdfForm;

  constructor(consenterEmail:string, corrections:ExhibitFormCorrection) {
    this.consenterEmail = consenterEmail;
    this.corrections = corrections;
    this.context = <IContext>ctx;
  }

  private initialize = async ():Promise<void> => {
    const { consenterEmail, corrections:{ entity_id } } = this;
    if( ! this._consenter) {
      this._consenter = await ConsenterCrud({ consenterInfo: { email:consenterEmail} as Consenter }).read() as Consenter;
    }
    if( ! this._entity) {
      this._entity = await EntityCrud({ entity_id } as Entity).read() as Entity;
    }
  }

  private getExhibitForm = (affiliate:Affiliate):IPdfForm => {
    const { BOTH, CURRENT, OTHER } = ExhibitFormConstraints;
    const constraint = ExhibitForm.getConstraintFromAffiliateType(affiliate.affiliateType);
    const { _consenter: consenter, _entity: { entity_id, entity_name } } = this;
    
    const parms = {
      consenter,
      consentFormUrl: consentFormUrl(consenter.email),
      data: { formType:FormTypes.SINGLE, constraint, entity_id, affiliates: [ affiliate ] },
      entity: { entity_id, entity_name },
      affiliateEmail: affiliate.email,
    } as ExhibitFormParms;

    switch(constraint) {
      case CURRENT:
        return ExhibitFormSingleCurrent.getInstance(parms);
      case OTHER:
        return ExhibitFormSingleBoth.getInstance(parms);
      case BOTH:
        return ExhibitFormSingleBoth.getInstance(parms);
    }
  }

  public sendToEntity = async ():Promise<boolean> => {
    const { context, initialize, corrections: { appends=[], deletes=[], updates=[] } } = this;

    await initialize();

    const { _consenter: { firstname, middlename, lastname }, _entity: { entity_id, entity_name }, getExhibitForm } = this;
    const { fullName } = PdfForm;
    const consenterFullname = fullName(firstname, middlename, lastname);
    const subject = 'ETT Notice of Exhibit Form Correction';
    let message = `${roleFullName(Roles.CONSENTING_PERSON)} ${consenterFullname} has corrected an exhibit form that was previously submitted to ${entity_name}.`

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
    const attachments = [] as PdfAttachment[];
    let counter = 0;

    // Build the attachments for affiliate updates
    updates.forEach(affiliate => {
      const name = `corrected-affiliate-${++counter}.pdf`;
      const pdf = getExhibitForm(affiliate);
      attachments.push({ name, description: name, pdf });
    });

    // Build the attachments for new affiliates
    counter = 0;
    appends.forEach(affiliate => {
      const name = `new-affiliate-${++counter}.pdf`;
      const pdf = getExhibitForm(affiliate);
      attachments.push({ name, description: name, pdf }); 
    });

    // Get the email recipients
    if( ! this._users) {
      this._users = (await UserCrud({ userinfo: { entity_id } as User }).read() ?? []) as User[];
    }

    const { _users: users } = this;

    // Get the ASP of the entity as the "to" addressee
    const asp = users.find(user => { 
      return (user.role == Roles.RE_ADMIN && user.active == YN.Yes) ? user.email : undefined
    });
    if( ! asp) {
      console.warn(`Could not find an active ${roleFullName(Roles.RE_ADMIN)} for entity: ${entity_id}`);
      return false;
    }

    // Get the other AI of the entity as a cc addressee.
    const cc = users.map(user => {
      return (user.role == Roles.RE_AUTH_IND && user.active == YN.Yes) ? user.email : undefined
    }).filter(email => email != undefined) as string[];

    // Find any delegates
    const delegates = users.map(user => {
      return (user.role == Roles.RE_AUTH_IND && user.active == YN.Yes && user.delegate) ? user.delegate?.email : undefined
    }).filter(email => email != undefined) as string[];

    // Add delegate emails, if any, to the cc list
    cc.push(...delegates);

    // Send the email
    console.log(`Sending exhibit form correction email to entity reps`);
    const from = `noreply@${context.ETT_DOMAIN}`;
    return sendEmail({ subject, from, message, to: [ asp.email ], cc, pdfAttachments: attachments } as EmailParms);
  }

  public sendToAffiliates = async (filter?:(email:string) => boolean):Promise<boolean> => {
    const { context, initialize, corrections: { updates=[] }, getExhibitForm } = this;

    await initialize();
    
    const { _consenter: { firstname, middlename, lastname }, _entity: { entity_name } } = this;
    const { fullName } = PdfForm;
    const consenterFullname = fullName(firstname, middlename, lastname);
    const subject = 'ETT Notice of Exhibit Form Correction';
    let message = `${roleFullName(Roles.CONSENTING_PERSON)} ${consenterFullname} has made corrections to your details in their exhibit form for ${entity_name}.`

    let allOk:boolean = true;
    for(let i=0; i<updates.length; i++) {
      const { email } = updates[i];

      // Skip any emails that are in the exclude list
      if(filter && ! filter(email)) {
        console.log(`Skipping email to ${email} because it does not meet filter criteria`);
        continue;
      }

      // Log what's about to happen
      console.log(`Sending exhibit form correction email to affiliate: ${email}`);

      // Send the email
      const from = `noreply@${context.ETT_DOMAIN}`;
      const pdf = getExhibitForm(updates[i]);
      const ok = await sendEmail({ subject, from, message, to: [ email ], pdfAttachments: [
        { name: 'correction.pdf', description: 'correction.pdf', pdf }
      ] } as EmailParms);
      allOk &&= ok;
    }

    return allOk;
  }

  public set entity(entity:Entity) {
    this._entity = entity;
  }

  public set consenter(consenter:Consenter) {
    this._consenter = consenter;
  }

  public set users(users:User[]) {  
    this._users = users;
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

  // Mock the entity and consenter (consenter must have a real email address)
  const entity = { 
    entity_id: 'eea2d463-2eab-4304-b2cf-cf03cf57dfaa', 
    entity_name: 'The School of Hard Knocks' 
  } as Entity;
  const consenter = {
    email: 'cp2@warhen.work', 
    phone_number: '1234567890',
    firstname: 'Elmer', middlename: 'F', lastname: 'Fudd', 
    consented_timestamp: [ new Date().toISOString() ]
  } as Consenter;

  // Mock the entity representatives but give them real email addresses
  const entity1 = { entity_id:'warnerbros', entity_name: 'Warner Bros.', active: YN.Yes } as Entity;
  const daffyduck = { email: 'daffyduck@warnerbros.com', entity_id: entity1.entity_id, role: Roles.RE_ADMIN, active: YN.Yes } as User;
  const porkypig = { email: 'porkypig@warnerbros.com', entity_id: entity1.entity_id, role: Roles.RE_AUTH_IND, active: YN.Yes } as User;
  const bugsbunny = { email: 'bugs@warnerbros.com', entity_id: entity1.entity_id, role: Roles.RE_AUTH_IND, active: YN.Yes } as User;
  const users = [ daffyduck, bugsbunny, porkypig ]
  users[0].email = 'asp1.random.edu@warhen.work';
  users[1].email = 'auth1.random.edu@warhen.work';
  users[2].email = 'auth2.random.edu@warhen.work';

  // Mock the correction data (affiliates must have real email addresses)
  const correctionEmail = new ExhibitCorrectionEmail(consenter.email, {
    entity_id: entity.entity_id,
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

  correctionEmail.entity = entity;
  correctionEmail.consenter = consenter;
  correctionEmail.users = users;

  (async ()=> {
    if( await correctionEmail.sendToEntity()) {
      correctionEmail.sendToAffiliates();
    }
  })();
}