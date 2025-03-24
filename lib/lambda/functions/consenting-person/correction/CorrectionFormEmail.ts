import * as ctx from '../../../../../contexts/context.json';
import { IContext } from "../../../../../contexts/IContext";
import { UserCrud } from "../../../_lib/dao/dao-user";
import { Consenter, roleFullName, Roles, User, YN } from "../../../_lib/dao/entity";
import { EmailParms, sendEmail } from "../../../_lib/EmailWithAttachments";
import { CorrectionForm } from "../../../_lib/pdf/CorrectionForm";
import { PdfForm } from "../../../_lib/pdf/PdfForm";

/**
 * This class represents an email that is sent to the representatives of an entity to inform them of a
 * correction a consenting individual has made to their name and/or contact details.
 */
export class ConsenterCorrectionEmail {
  private oldConsenter:Consenter;
  private correctionForm:CorrectionForm;

  constructor(oldConsenter:Consenter, newConsenter:Consenter) {
    this.oldConsenter = oldConsenter;
    this.correctionForm = new CorrectionForm(oldConsenter, newConsenter);
  }

  public sendToEntity = async (entity_id:string):Promise<boolean> => {
    const context:IContext = <IContext>ctx;
    const { oldConsenter: {firstname, middlename, lastname }, correctionForm } = this;
    const fullname = PdfForm.fullName(firstname, middlename, lastname);
    const users = (await UserCrud({ userinfo: { entity_id } as User }).read() ?? []) as User[];

    // Get the first AI of the entity as the "to" addressee
    const firstAI = users.find(user => user.active == YN.Yes && user.role == Roles.RE_AUTH_IND);
    if( ! firstAI) {
      console.warn(`Could not find an active ${roleFullName(Roles.RE_AUTH_IND)} for entity: ${entity_id}`);
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
    console.log(`Sending consenter correction email to entity: ${entity_id}`);
    return sendEmail({
      subject: `ETT Consenter Correction Notification`,
      from: `noreply@${context.ETT_DOMAIN}`,
      message: `Please find enclosed a correction form listing modifications that consenting ` +
        `individual ${fullname} has made to their name and/or contact details.`,
      to: [ firstAI.email ], cc, bcc,
      pdfAttachments: [
        {
          pdf: correctionForm,
          name: 'consenter-correction-form.pdf',
          description: 'consenter-correction-form.pdf'
        }
      ]
    } as EmailParms);
  }

  public getCorrectionForm =():CorrectionForm => {
    return this.correctionForm;
  }
}




/**
 * RUN MANUALLY: Modify entity_id to reflect an existing entity
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/consenting-person/correction/CorrectionFormEmail.ts')) {

  const oldConsenter = {
    email: 'bugs@warnerbros.com',
    firstname: 'Bugs',
    middlename: 'Bartholomew',
    lastname: 'Bunny',
    phone_number: '+1234567890',
    active: 'Y'
  } as Consenter;

  const newConsenter = {
    email: 'bugs@warnerbros.com',
    firstname: 'Bugs',
    middlename: 'Cornelius',
    lastname: 'Bunny',
    phone_number: '+1234567890',
    active: 'Y'
  } as Consenter;

  const entity_id = '13376a3d-12d8-40e1-8dee-8c3d099da1b2';

  (async() => {
    await new ConsenterCorrectionEmail(oldConsenter, newConsenter).sendToEntity(entity_id);
  })();
}