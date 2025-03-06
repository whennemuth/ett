import * as ctx from '../../../../../contexts/context.json';
import { IContext } from "../../../../../contexts/IContext";
import { EntityCrud } from '../../../_lib/dao/dao-entity';
import { Entity, User } from "../../../_lib/dao/entity";
import { EmailParms, sendEmail } from '../../../_lib/EmailWithAttachments';
import { log } from '../../../Utils';

/**
 * This class represents an email that is sent to entity representatives to inform them that another member
 * of the entity has removed them from the entity.
 */
export class EntityCorrectionEmail {
  private replaceable:User;
  private replacer:User;
  private entity?:Entity;

  constructor(replaceable:User, replacer:User, entity?:Entity) {
    this.replaceable = replaceable;
    this.replacer = replacer;
    this.entity = entity;
  }

  public send = async (toEmail?:string):Promise<boolean> => {
    const context:IContext = <IContext>ctx;
    let { 
      replaceable, 
      replaceable: { email:replaceableEmail }, 
      replacer, 
      replacer: { fullname, email:replacerEmail },
      entity 
    } = this;

    const selfCorrection = replaceableEmail == replacerEmail;

    if(selfCorrection && ! toEmail) {
      // A user need not be informed about an action they themselves have taken.
      log({ replacer, replaceable }, 'Skipping "send-to-self" entity correction email');
      return false;
    }

    // Get the entity for its full name from the database if no entity was provided.
    if( ! entity) {
      entity = await EntityCrud({ entity_id:replaceable.entity_id } as Entity).read() as Entity;
      this.entity = entity;
    }

    const { entity_name } = entity;

    let message = `This email is notification of change regarding your registration in the Ethical ` +
      `Training Tool (ETT): ${fullname} has removed you from ${entity_name}.`

    if(toEmail) {
      const removedPerson = selfCorrection ? 'themselves' : replaceable.fullname;
      message = `This email is notification of change regarding the entity you are registered with in ` +
        `the Ethical Training Tool (ETT): ${fullname} has removed ${removedPerson} from ${entity_name}.`
    }

    // Send the email
    console.log(`Sending entity correction email to: ${replaceableEmail} about their removal from ${entity_name} by ${fullname}`);
    return sendEmail({
      subject: `ETT Entity Correction Notification`,
      from: `noreply@${context.ETT_DOMAIN}`,
      message,
      to: [ toEmail ?? replaceableEmail ]
    } as EmailParms);
  }
}



/**
 * RUN MANUALLY:
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/authorized-individual/correction/EntityCorrectionEmail.ts')) {

  (async () => {
    const replacer = { email:'auth2.au.edu@warhen.work', fullname:'Marlon Brando' } as User;
    const replaceable = { email:'auth1.au.edu@warhen.work'} as User;
    const entity = { entity_name:'The Actors Guild' } as Entity;
    await new EntityCorrectionEmail(replaceable, replacer, entity).send();
    console.log('Email sent.')
  })();
}