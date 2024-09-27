import { IContext } from "../../../../contexts/IContext";
import { DAOFactory } from "../../_lib/dao/dao";
import { Consenter, Entity, YN } from "../../_lib/dao/entity";
import { EmailParms, sendEmail } from "../../_lib/EmailWithAttachments";
import { PdfForm } from "../../_lib/pdf/PdfForm";
import { lookupCloudfrontDomain } from "../../Utils";


export class ExhibitFormRequestEmail {
  private consenterEmail:string;
  private entity_id:string;
  private domain:string;

  constructor(consenterEmail:string, entity_id:string, domain:string) {
    this.consenterEmail = consenterEmail;
    this.entity_id = entity_id;
    this.domain = domain;
  }

  public send = async ():Promise<boolean> => {
    const { consenterEmail, entity_id, domain } = this;

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
  
    return sendEmail({
      subject: `ETT Exhibit Form Request`,
      message: `Thankyou ${consenterFullName} for registering with the Ethical Tranparency Tool.<br>` +
        `${entity_name} is requesting you take the next step and fill out a prior contacts or "exhibit" form.<br>` +
        `Follow the link provided below to log in to your ETT account and to access the form:` + 
        `<p>https://${domain}/consenter/exhibits/index.htm</p>`,
      emailAddress:consenterEmail,
      attachments: []
    } as EmailParms);
  
  }
}




/**
 * RUN MANUALLY: Modify email as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_SEND_EXHIBIT_FORM_REQUEST') {

  const consenterEmail = 'cp1@warhen.work';
  const entity_id = '3ef70b3e-456b-42e8-86b0-d8fbd0066628';

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
    
    await new ExhibitFormRequestEmail(consenterEmail, entity_id, cloudfrontDomain).send();

    console.log('Email sent!');
  })();

}