import { IContext } from "../../../../contexts/IContext";
import * as ctx from '../../../../contexts/context.json';
import { DAOFactory } from "../../_lib/dao/dao";
import { Consenter, Entity, ExhibitFormConstraints, YN } from "../../_lib/dao/entity";
import { EmailParms, sendEmail } from "../../_lib/EmailWithAttachments";
import { PdfForm } from "../../_lib/pdf/PdfForm";
import { lookupCloudfrontDomain } from "../../Utils";
import { AffilatePositionAcademic, AffilatePositionAcademicStrings, AffiliatePosition, AffiliatePositionCategory, AffiliatePositionCustom, AffiliatePositionEmployer, AffiliatePositionEmployerStrings, AffiliatePositionOther, AffiliatePositionOtherStrings, AffiliatePositionsCustom } from "./ExhibitFormRequest";

export type ExhibitFormRequestEmailParms = {
  consenterEmail:string;
  entity_id:string;
  linkUri:string;
  constraint: ExhibitFormConstraints,
  lookback?:string
  positions?:AffiliatePosition[]
}

export class ExhibitFormRequestEmail {
  private parms:ExhibitFormRequestEmailParms;

  constructor(parms:ExhibitFormRequestEmailParms) {
    this.parms = parms;
  }

  public send = async ():Promise<boolean> => {
    let { parms: { consenterEmail, entity_id, linkUri, constraint, lookback, positions=[] }} = this;
    const { BOTH, CURRENT, OTHER } = ExhibitFormConstraints;
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

    // Prevent any special characters in the link from being interpreted as HTML
    linkUri = linkUri
      .replace(/&/g, "&amp;")
      .replace(/=/g, "=3D");  // Ensure '=' is properly handled in quoted-printable

    // Prepare verbiage for the lookback period
    let lookbackMsg = '';
    if(/^\d+$/.test(`${lookback}`)) {
      lookbackMsg = `Please limit the individuals you list to those you have had an association with in the last <b>${lookback} years</b>.`;
    }
    else {
      lookbackMsg = `Please note, there is no limit for how far back your association with the individuals you list can go.`;
    }

    // Prepare verbiage for the positions of interest
    let positionsMsg = '';
    type PositionData = { category:AffiliatePositionCategory, value:string }
    const getPositionData = (position:AffiliatePosition):PositionData => {
      const { id } = position;
      if(Object.keys(AffiliatePositionEmployer).includes(id.toString())) {
        return { 
          category:AffiliatePositionCategory.EMPLOYER, 
          value:AffiliatePositionEmployer[id as unknown as AffiliatePositionEmployerStrings]
        };
      }
      else if(Object.keys(AffilatePositionAcademic).includes(id.toString())) {
        return { 
          category:AffiliatePositionCategory.ACADEMIC, 
          value:AffilatePositionAcademic[id as unknown as AffilatePositionAcademicStrings]
        };
      }
      else if(Object.keys(AffiliatePositionOther).includes(id.toString())) {
        return { 
          category:AffiliatePositionCategory.OTHER, 
          value:AffiliatePositionOther[id as unknown as AffiliatePositionOtherStrings]
        };
      }
      else {
        switch(position.id as AffiliatePositionsCustom) {
          case AffiliatePositionsCustom.ACADEMIC:
            return { 
              category: AffiliatePositionCategory.ACADEMIC, value: position.value as AffilatePositionAcademicStrings 
            };
          case AffiliatePositionsCustom.EMPLOYER:
            return {
              category: AffiliatePositionCategory.EMPLOYER, value: position.value as AffiliatePositionEmployerStrings
            }
          case AffiliatePositionsCustom.OTHER:
            return {
              category: AffiliatePositionCategory.OTHER, value: position.value as AffiliatePositionOtherStrings
            }
        }
      }
    }

    positionsMsg = 'Please note, we are interested in individuals who hold/held the following positions:';
    positionsMsg += `<ul>`;
    positions.forEach((position) => {
      const { category, value } = getPositionData(position);
      positionsMsg += `<li><b>${category}:</b> ${value}</li>`;
    });
    positionsMsg += `</ul>`;
    
    return sendEmail({
      subject: `ETT Exhibit Form Request`,
      to: [ consenterEmail ],
      message: `Thank you ${consenterFullName} for registering with the Ethical Tranparency Tool.<br>` +
        `${entity_name} is requesting you take the next step and fill out a current/prior contacts or "exhibit" form.<br>` +
        `<p><b>${lookbackMsg}</b></p>` +
        `<p><b>${positionsMsg}</b></p>` +
        `Follow the link provided below to log in to your ETT account and to access the form:` + 
        `<p>${linkUri}</p>`,
      from,
      pdfAttachments: []
    } as EmailParms);  
  }
}




/**
 * RUN MANUALLY: Modify email as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/authorized-individual/ExhibitFormRequestEmail.ts')) {

  const consenterEmail = 'cp1@warhen.work';
  const entity_id = '8398e6c6-8e47-42d7-9bd6-9b6db54bd19c';

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
      constraint:"both",
      lookback: '5',
      positions: [ 
        { id:AffiliatePositionsCustom.EMPLOYER, value:'Manager of things and stuff' },
        { id:'fc' },
        { id:'nc' }
      ]
    } as ExhibitFormRequestEmailParms).send();

    console.log('Email sent!');
  })();

}