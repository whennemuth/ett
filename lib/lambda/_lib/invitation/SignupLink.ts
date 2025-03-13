import { Actions } from '../../../role/AbstractRole';
import { error } from '../../Utils';
import { lookupUserPoolClientId, lookupUserPoolId } from '../cognito/Lookup';
import { Role } from "../dao/entity";

export type SignupLinkParms = {
  userPoolName?:string,
  region?:string
}

export type RegistrationLinkParms = {
  email?:string,
  entity_id?:string,
  registrationUri?:string
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
      this.region = parms.region;
    }
    this.region = this.region || process.env.REGION;
    this.userPoolName = this.userPoolName || process.env.USERPOOL_NAME;
  }

  public getCognitoLinkForRole = async (role:Role, redirectUri?:string):Promise<string|undefined> => {

    try {

      let { region, userPoolName } = this;

      if( ! region) {
        console.error('Missing region parameter!');
        return;
      }

      if( ! userPoolName) {
        console.error('Missing userpool name parameter!');
        return;
      }

      const userPoolId = await lookupUserPoolId(userPoolName, region);
      if( ! userPoolId ) {
        console.error('Could not determine userpool ID for signin link');
        return;
      }
  
      const userPoolClientId = await lookupUserPoolClientId(userPoolId, role, region);
      if( ! userPoolClientId ) {
        console.error('Could not determine userpool client ID for signin link');
        return;
      }

      const cognitoDomain = process.env.COGNITO_DOMAIN;
      if( ! cognitoDomain ) {
        console.error('Could not determine cognito domain for signin link');
        return;
      }      
  
      if( ! redirectUri) {
        redirectUri = process.env.REDIRECT_URI;
        if( ! redirectUri ) {
          console.error('Could not determine redirect URI for signin link');
          return;
        }
      }
  
      const params = {
        client_id: userPoolClientId,
        response_type: 'code',
        scope: 'email+openid+phone',
        redirect_uri: encodeURIComponent(`${redirectUri}?action=${Actions.post_signup}&selected_role=${role}`)
      } as any;
  
      const queryString = Object.keys(params).map(key => `${key}=${params[key]}`).join('&');
      const signUpUrl = `https://${cognitoDomain}/signup?${queryString}`;
      return signUpUrl;  
    } 
    catch (e) {
      error(e);
      return undefined;
    }  
  }

  public getRegistrationLink = async (parms:RegistrationLinkParms):Promise<string|undefined> => {
    let { email, entity_id, registrationUri } = parms;
    if(email) email = email.toLowerCase();
    return new Promise((resolve, reject) => {
      let link:string;
      if(registrationUri) {
        link = registrationUri;
        const url = new URL(link);
        if(url.pathname.startsWith('/bootstrap/')) {
          link = `${link}?action=${Actions.register_entity}`;
          if(entity_id) {
            link = `${link}&entity_id=${entity_id}`
          }
          if(email) {
            link = `${link}&email=${email}`
          }
        }
        else {
           if(entity_id) {
            link = `${link}?entity_id=${entity_id}`
          }
          if(email) {
            let delimeter = link.includes('?') ? '&' : '?';
            link = `${link}${delimeter}email=${email}`
          }
        }
      }
      else {
        link = `https://${process.env.CLOUDFRONT_DOMAIN}`;
      }
      resolve(link);
    });
  }
}
