import { lookupUserPoolClientId, lookupUserPoolId } from '../cognito/Lookup';
import { Role } from "../dao/entity";

export type SignupLinkParms = {
  userPoolName?:string,
  region?:string
}

/**
 * This class provides a method to construct a link that brings the user to the signin screen for a 
 * particular cognito userpool client associated with the specified role.
 */
export class SignupLink {
  private userPoolName:string|undefined;
  private region:string|undefined;

  constructor(parms?:SignupLinkParms) {
    if(parms) {
      this.userPoolName = parms.userPoolName;
      this.region = parms.region
    }
    this.region = this.region || process.env.REGION;
    this.userPoolName = this.userPoolName || process.env.USERPOOL_NAME;
  }

  public getCognitoLinkForRole = async (role:Role):Promise<string|undefined> => {

    try {

      if( ! this.region) {
        console.error('Missing region parameter!');
        return;
      }

      if( ! this.userPoolName) {
        console.error('Missing userpool name parameter!');
        return;
      }

      const userPoolId = await lookupUserPoolId(this.userPoolName, this.region);
      if( ! userPoolId ) {
        console.error('Could not determine userpool ID for signin link');
        return;
      }
  
      const userPoolClientId = await lookupUserPoolClientId(userPoolId, role, this.region);
      if( ! userPoolClientId ) {
        console.error('Could not determine userpool client ID for signin link');
        return;
      }

      const cognitoDomain = process.env.COGNITO_DOMAIN;
      if( ! cognitoDomain ) {
        console.error('Could not determine cognito domain for signin link');
        return;
      }      
  
      const redirectURI = process.env.REDIRECT_URI;
      if( ! redirectURI ) {
        console.error('Could not determine redirect URI for signin link');
        return;
      }
  
      const params = {
        client_id: userPoolClientId,
        response_type: 'code',
        scope: 'email+openid+phone',
        redirect_uri: encodeURIComponent(`https://${redirectURI}?action=signedup`)
      } as any;
  
      const queryString = Object.keys(params).map(key => `${key}=${params[key]}`).join('&');
      const signUpUrl = `https://${cognitoDomain}/signup?${queryString}`;
      return signUpUrl;  
    } 
    catch (e) {
      console.log(e);
      return undefined;
    }  
  }

  public getRegistrationLink = async (entity_id?:string):Promise<string|undefined> => {
    return new Promise((resolve, reject) => {
      const cfdomain = process.env.CLOUDFRONT_DOMAIN;
      let link = `https://${cfdomain}?action=acknowledge`;
      if(entity_id) {
        link = `${link}&entity_id=${entity_id}`
      }
      resolve(link);
    });
  }
}
