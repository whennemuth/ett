import { LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { ExhibitFormConstraint, ExhibitFormConstraints } from "../../_lib/dao/entity";
import { errorResponse, invalidResponse, okResponse } from "../../Utils";
import { ExhibitFormRequestEmail } from "./ExhibitFormRequestEmail";


export type SendExhibitFormRequestParms = {
  consenterEmail:string, entity_id:string, constraint:ExhibitFormConstraint, linkUri?:string
}

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
    const cloudfrontDomain = process.env.CLOUDFRONT_DOMAIN;
    if( ! cloudfrontDomain) return;
    return `https://${process.env.CLOUDFRONT_DOMAIN}`
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
    let { parms: { consenterEmail, constraint, entity_id }, getLink } = this;

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
          constraint 
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