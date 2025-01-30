import { IContext } from "../../../../contexts/IContext";
import * as ctx from '../../../../contexts/context.json';
import { DAOFactory } from "../../_lib/dao/dao";
import { Consenter, Entity, YN } from "../../_lib/dao/entity";
import { EmailParms, sendEmail } from "../../_lib/EmailWithAttachments";
import { PdfForm } from "../../_lib/pdf/PdfForm";
import { lookupCloudfrontDomain } from "../../Utils";

export type ExhibitFormRequestEmailParms = {
  consenterEmail:string;
  entity_id:string;
  linkUri:string;
  constraint: 'current' | 'other' | 'both';
}

export class ExhibitFormRequestEmail {
  private parms:ExhibitFormRequestEmailParms;

  constructor(parms:ExhibitFormRequestEmailParms) {
    this.parms = parms;
  }

  public send = async ():Promise<boolean> => {
    let { parms: { consenterEmail, entity_id, linkUri, constraint }} = this;
    if((linkUri ?? '').endsWith('/')) {
      linkUri = linkUri.substring(0, linkUri.length -1); // Clip off trailing '/'
    }

    // Get the consenter
    const consenterDao = DAOFactory.getInstance({ DAOType: 'consenter', Payload: { email: consenterEmail} as Consenter});
    const consenter = await consenterDao.read() as Consenter;
    const { firstname, middlename, lastname, active:activeConsenter } = consenter;
    if(activeConsenter == YN.No) {
      console.log(`Cannot send exhibit form request to ${consenterEmail} for ${entity_id} because consenter is inactive`);
      return false;
    }
    const consenterFullName = PdfForm.fullName(firstname, middlename, lastname);

    // Get the entity
    const entityDao = DAOFactory.getInstance({ DAOType: 'entity', Payload: { entity_id } as Entity });
    const entity = await entityDao.read() as Entity;
    const { entity_name, active:activeEntity } = entity;
    if(activeEntity == YN.No) {
      console.log(`Cannot send exhibit form request to ${consenterEmail} for ${entity_id} because entity is inactive`);
      return false;
    }
  
    // Get who the email will say it is from
    const context:IContext = <IContext>ctx;
    const from = `noreply@${context.ETT_DOMAIN}`;
    
    return sendEmail({
      subject: `ETT Exhibit Form Request`,
      to: [ consenterEmail ],
      message: `Thankyou ${consenterFullName} for registering with the Ethical Tranparency Tool.<br>` +
        `${entity_name} is requesting you take the next step and fill out a prior contacts or "exhibit" form.<br>` +
        `Follow the link provided below to log in to your ETT account and to access the form:` + 
        `<p>${linkUri}</p>`,
      from,
      attachments: []
    } as EmailParms);  
  }
}




/**
 * RUN MANUALLY: Modify email as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/authorized-individual/ExhibitFormRequestEmail.ts')) {

  const consenterEmail = 'cp1@warhen.work';
  const entity_id = '2c0c4086-1bc0-4876-b7db-ed4244b16a6b';

  (async() => {
    // 1) Get context variables
    const context:IContext = await require('../../../../contexts/context.json');
    const { REGION, TAGS: { Landscape }} = context;
    process.env.REGION = REGION;

    // 1) Gt the cloudfront domain
    const cloudfrontDomain = await lookupCloudfrontDomain(Landscape);
    if( ! cloudfrontDomain) {
      throw('Cloudfront domain lookup failure');
    }
    process.env.CLOUDFRONT_DOMAIN = cloudfrontDomain;
    
    await new ExhibitFormRequestEmail({ 
      consenterEmail, 
      entity_id, 
      linkUri:`https://${cloudfrontDomain}`, 
      constraint:"both" 
    } as ExhibitFormRequestEmailParms).send();

    console.log('Email sent!');
  })();

}