import { LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { ExhibitFormConstraint, ExhibitFormConstraints } from "../../_lib/dao/entity";
import { errorResponse, invalidResponse, okResponse } from "../../Utils";
import { ExhibitFormRequestEmail } from "./ExhibitFormRequestEmail";

export enum AffiliatePositionEmployer {
  hr = 'HR professional',
  du = 'Department / Unit Head',
  ds = 'Direct Supervisor',
  co = 'Colleague / Coworker',
}
export enum AffilatePositionAcademic {
  pr = 'President',
  pv = 'Provost',
  vp = 'Vice President or Vice Provost',
}
export enum AffiliatePositionOther {
  ed = 'Executive Director/CEO',
  bc = 'Board Chair / Vice Chair',
  bm = 'Board Member',
  bs = 'Board Secretary',
  ec = 'Executive Committee Chair / Vice Chair',
  em = 'Executive Committee Member',
  mc = 'Membership Committee Chair / Officer',
  hn = 'Honors / Awards Nominations Committee Chair',
  hm = 'Honors / Awards Nominations Committee Member',
  fc = 'Fellowship Committee Chair',
  fm = 'Fellowship Committee Member',
  ac = 'Advisory Council Chair',
  am = 'Advisory Council Member'
}

export enum AffiliatePositionsCustom {
  EMPLOYER = 'custom-employer',
  ACADEMIC = 'custom-academic',
  OTHER = 'custom-other'
}
export type AffiliatePositionCustom = {
  [ key in AffiliatePositionsCustom ]: string
}
export type AffiliatePosition = {
  id: AffiliatePositionEmployer | AffilatePositionAcademic | AffiliatePositionOther | AffiliatePositionsCustom,
  value?: string
}
export enum AffiliatePositionCategory {
  EMPLOYER = 'Employers',
  ACADEMIC = 'Current and Prior Academic / Professional Societies & Organizations',
  OTHER = 'Other Organizations Where You Formerly Had Appointments'
}
export type SendExhibitFormRequestParms = {
  consenterEmail:string, 
  entity_id:string, 
  constraint:ExhibitFormConstraint, 
  linkUri?:string, 
  lookback?:string,
  positions?:AffiliatePosition[]
}


export type AffilatePositionAcademicStrings = keyof typeof AffilatePositionAcademic;
export type AffiliatePositionEmployerStrings = keyof typeof AffiliatePositionEmployer;
export type AffiliatePositionOtherStrings = keyof typeof AffiliatePositionOther;

export class ExhibitFormRequest {
  private parms: SendExhibitFormRequestParms;

  constructor(parms:SendExhibitFormRequestParms) {
    this.parms = parms;
  }

  /**
   * If no link is provided, attempt to construct it from what can be found in environment variables.
   * @returns 
   */
  private getDefaultLinkUri = ():string|void => {
    const { CLOUDFRONT_DOMAIN, PRIMARY_DOMAIN } = process.env;
    const domain = PRIMARY_DOMAIN || CLOUDFRONT_DOMAIN;
    if( ! domain) return;
    return `https://${domain}`
  }

  /**
   * Test to see if the basic href indicates the bootstrap website - a truthy return value means it does.
   * @param url 
   * @returns 
   */
  private tryAsBootstrapLink = (url:URL):string|void => {
    const { parms: { entity_id, constraint } } = this;
    const { pathname:path } = url;

    // Bail out if the url does not indicate a bootstrap link
    const isABootstrapLink = () => path.endsWith('/bootstrap') || path.startsWith('/bootstrap/')
    if( ! isABootstrapLink()) return;

    let pathParts = path.split('/');
    // Strip out index.htm if it is there. It should be at the end, not the middle, but account for that anyway
    pathParts = pathParts.filter(part => part && part != 'index.htm');

    url.pathname = `${pathParts.join('/')}/consenting/add-exhibit-form/${constraint}/index.htm`;
    url.hash = `entity_id=${entity_id}`;
    return url.href;
  }

  /**
   * Test to see if the basic href indicates the standard website - a truthy return value means it does.
   * @param url 
   * @returns 
   */
  private tryAsStandardWebsiteLink = (url:URL):string|void => {
    const { parms: { entity_id, constraint } } = this;
    const { pathname:path } = url;

    let pathParts = path.split('/');
    // Strip out any html file if it is there. It should be at the end, not the middle, but account for that anyway
    pathParts = pathParts.filter(part => part && /^\w+\.((htm)|(html))$/i.test(part) == false);

    url.pathname = `${pathParts.join('/')}/consenting/add-exhibit-form/${constraint}`;
    url.hash = `entity_id=${entity_id}`;
    return url.href;
  }

  /**
   * Get the href of the link to be sent in the exhibit form request email.
   * @returns 
   */
  public getLink = (): string|void => {
    let { parms: { linkUri }, getDefaultLinkUri, tryAsBootstrapLink, tryAsStandardWebsiteLink } = this;
    const href = linkUri ?? getDefaultLinkUri();
    if( ! href) return;
    const url = new URL(href);

    let link = tryAsBootstrapLink(url);
    if(link) return link;

    // Test to see if the basic href indicates the standard website - a truthy return value means it does.
    link = tryAsStandardWebsiteLink(url);
    if(link) return link;

    // There was something wrong with the basic href;
    return;
  }

  /**
   * Send the exhibit form request email
   * @returns 
   */
  public sendEmail = async ():Promise<LambdaProxyIntegrationResponse> => {
    let { parms: { consenterEmail, constraint, entity_id, lookback, positions }, getLink } = this;

    const linkUri = getLink();
  
    if( ! linkUri) {
      return errorResponse('Email failure for exhibit form request: Cannot determine link to put in the email!');
    }
  
    const { BOTH, CURRENT, OTHER } = ExhibitFormConstraints;
    switch(constraint) {
      case BOTH: case CURRENT: case OTHER:
        const sent = await new ExhibitFormRequestEmail({ 
          consenterEmail, 
          entity_id, 
          linkUri, 
          constraint,
          lookback,
          positions
        }).send();
  
        // Bail out if the email failed
        if( ! sent) {
          return errorResponse(`Email failure for exhibit form request: ${JSON.stringify({ consenterEmail, entity_id }, null, 2)}`);
        }
        
        return okResponse('Ok', {});
        
      default:
        return invalidResponse(`Invalid/missing affiliate constraint parameter: ${constraint}`);
    }
  }
}