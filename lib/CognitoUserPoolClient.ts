import { Duration } from "aws-cdk-lib";
import { OAuthScope, UserPool, UserPoolClient, UserPoolClientIdentityProvider, UserPoolClientProps } from "aws-cdk-lib/aws-cognito";
import { Role, Roles } from './lambda/_lib/dao/entity';
import { Actions } from "./role/AbstractRole";
import { IContext } from "../contexts/IContext";

export interface EttUserPoolClientProps { callbackDomainName:string, role:Role, customScopes?:OAuthScope[] }

/**
 * Static factory class for producing a UserPoolClients universal characteristics preset, but custom scopes injected. 
 */
export class EttUserPoolClient extends UserPoolClient {
  
  private role:Role;

  constructor(userPool: UserPool, id: string, props: UserPoolClientProps) {    
    super(userPool, `${id}-userpool-client`, props);
  }

  public getRole(): Role {
    return this.role;
  }

  public static buildCustomScopedClient(userPool: UserPool, id: string, props: EttUserPoolClientProps): EttUserPoolClient {
    
    const context: IContext = userPool.node.getContext('stack-parms');
    const { TAGS: {Landscape }, STACK_ID } = context;
    let scopes:OAuthScope[] = [ OAuthScope.EMAIL, OAuthScope.PHONE, OAuthScope.PROFILE ];
    const {customScopes, callbackDomainName, role } = props;
    if(customScopes) {
      scopes = scopes.concat(customScopes);
    }

    /**
     * Get urls to the app location that cognito will "callback" or redirect to upon successful signin.
     */
    const getCallbackUrls = (rootObject:string, subfolder:string=''): string[] => {
      let callbackUrlRoot = `https://${callbackDomainName}`;
      if(subfolder) {
        callbackUrlRoot = `${callbackUrlRoot}/${subfolder}`;
      }
      const urls = [
        `${callbackUrlRoot}/${rootObject}`,
        `${callbackUrlRoot}/${rootObject}?action=${Actions.login}&selected_role=${role}`,
        `${callbackUrlRoot}/${rootObject}?action=${Actions.post_signup}&selected_role=${role}`,
      ] as string[];

      if(role == Roles.CONSENTING_PERSON) {
        urls.push(`${callbackUrlRoot}/consenter/exhibits/CURRENT/${rootObject}?action=${Actions.login}&selected_role=${role}`);        
        urls.push(`${callbackUrlRoot}/consenter/exhibits/OTHER/${rootObject}?action=${Actions.login}&selected_role=${role}`);        
        urls.push(`${callbackUrlRoot}/consenter/exhibits/BOTH/${rootObject}?action=${Actions.login}&selected_role=${role}`);
      }
      else {
        urls.push(`${urls[1]}&task=amend`);
        urls.push(`${urls[2]}&task=amend`);
      }

      return urls;
    }

    /**
     * Get urls to the app location that cognito will redirect to upon successful signout.
     */
    const getLogoutUrls = (rootObject:string, subfolder:string=''): string[] => {
      let callbackUrlRoot = `https://${callbackDomainName}`;
      if(subfolder) {
        callbackUrlRoot = `${callbackUrlRoot}/${subfolder}`;
      }

      const urls = [
        `${callbackUrlRoot}/${rootObject}?action=${Actions.logout}`,
      ] as string[];

      if(role == Roles.CONSENTING_PERSON) {
        urls.push(`${callbackUrlRoot}/consenter/exhibits/CURRENT/${rootObject}?action=${Actions.logout}`);
        urls.push(`${callbackUrlRoot}/consenter/exhibits/OTHER/${rootObject}?action=${Actions.logout}`);
        urls.push(`${callbackUrlRoot}/consenter/exhibits/BOTH/${rootObject}?action=${Actions.logout}`);
      }

      return urls;
    }

    const callbackUrls = getCallbackUrls('index.htm', 'bootstrap');
    callbackUrls.push(...getCallbackUrls('index.html'));

    const logoutUrls = getLogoutUrls('index.htm', 'bootstrap');
    logoutUrls.push(...getLogoutUrls('index.html'));

    const client = new EttUserPoolClient(userPool, id, {
      userPool,
      userPoolClientName: `${role}-${STACK_ID}-${Landscape}-userpool-client`,
      supportedIdentityProviders: [ UserPoolClientIdentityProvider.COGNITO ],
      oAuth: {
        flows: { authorizationCodeGrant: true, implicitCodeGrant: false },
        scopes,
        callbackUrls,
        logoutUrls
      },
      accessTokenValidity: Duration.days(1),
      idTokenValidity: Duration.days(1),
      refreshTokenValidity: Duration.days(7),
      authSessionValidity: Duration.minutes(5)
    });

    client.role = role;

    return client;
  }
}