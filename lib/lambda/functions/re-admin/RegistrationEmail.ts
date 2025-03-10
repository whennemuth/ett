import * as ctx from '../../../../contexts/context.json';
import { IContext } from "../../../../contexts/IContext";
import { Roles } from "../../_lib/dao/entity";
import { sendEmail } from "../../_lib/EmailWithAttachments";
import { getSampleData, RegistrationFormEntity, RegistrationFormEntityData } from "../../_lib/pdf/RegistrationFormEntity";
import { log } from "../../Utils";

/**
 * This class represents an email that is issued to a recipient 
 * who has just completed their registration into an entity.
 */
export class EntityRegistrationEmail {
  private data:RegistrationFormEntityData;

  constructor(data:RegistrationFormEntityData) {
    this.data = data;
  }

  public send = async ():Promise<boolean> => {
    const { data, data: { email, role, entity: { users, entity_name } }} = this;
    const context:IContext = <IContext>ctx;
    let aspEmail = role === Roles.RE_ADMIN ? email : users.find(u => u.role === Roles.RE_ADMIN)?.email;
    let aiEmail1 = role === Roles.RE_AUTH_IND ? email : users.find(u => u.role === Roles.RE_AUTH_IND)?.email;
    let aiEmail2 = users.find(u => u.role === Roles.RE_AUTH_IND && u.email != `${aiEmail1}`)?.email;

    if( ! aspEmail) {
      log('Could not determine email address of the ASP.');
      return false;
    }

    const cc = [];
    if(aiEmail1) cc.push(aiEmail1);
    if(aiEmail2) cc.push(aiEmail2);

    log({ to:aspEmail, cc }, 'Sending entity registration email');

    return await sendEmail({
      to: [ aspEmail ], cc,
      subject: 'ETT Entity Registration Form',
      from: `noreply@${context.ETT_DOMAIN}`, 
      message: `Please find enclosed a pdf copy of the ETT registration form, for ${entity_name}`,
      pdfAttachments: [
        {
          pdf: new RegistrationFormEntity(data),
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
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/re-admin/RegistrationEmail.ts')) {
  const email = process.env.PDF_RECIPIENT_EMAIL;

  if( ! email) {
    console.log('Email environment variable is missing. Put PDF_RECIPIENT_EMAIL=[email] in .env in ${workspaceFolder}');
    process.exit(1);
  }

  (async () => {
    const data = getSampleData();
    data.email = email; // override email
    const regEmail = new EntityRegistrationEmail({ ...data, loginHref: 'https://www.example.com' });
    await regEmail.send();
  })();
}