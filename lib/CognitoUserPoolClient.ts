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
    const { TAGS: {Landscape }, STACK_ID, REDIRECT_PATH_BOOTSTRAP, REDIRECT_PATH_WEBSITE } = context;
    let scopes:OAuthScope[] = [ OAuthScope.EMAIL, OAuthScope.PHONE, OAuthScope.PROFILE ];
    const {customScopes, callbackDomainName, role } = props;
    if(customScopes) {
      scopes = scopes.concat(customScopes);
    }

    /**
     * Get urls to the app location that cognito will "callback" or redirect to upon successful signin.
     */
    const getCallbackUrls = (rootPath:string): string[] => {
      let callbackUrlRoot = `https://${callbackDomainName}`;
      const subfolder = rootPath.substring(0, rootPath.lastIndexOf('/'));
      const rootObject = rootPath.substring(rootPath.lastIndexOf('/')+1);
      if(subfolder) {
        callbackUrlRoot = `${callbackUrlRoot}/${subfolder}`;
      }
      const urls = [
        `${callbackUrlRoot}/${rootObject}`,
        `${callbackUrlRoot}/${rootObject}?action=${Actions.login}&selected_role=${role}`,
        `${callbackUrlRoot}/${rootObject}?action=${Actions.post_signup}&selected_role=${role}`,
      ] as string[];

      if(role == Roles.CONSENTING_PERSON) {
        urls.push(`${callbackUrlRoot}/consenting/add-exhibit-form/current/${rootObject}?action=${Actions.login}&selected_role=${role}`);        
        urls.push(`${callbackUrlRoot}/consenting/add-exhibit-form/other/${rootObject}?action=${Actions.login}&selected_role=${role}`);        
        urls.push(`${callbackUrlRoot}/consenting/add-exhibit-form/both/${rootObject}?action=${Actions.login}&selected_role=${role}`);
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
    const getLogoutUrls = (rootPath:string): string[] => {
      let callbackUrlRoot = `https://${callbackDomainName}`;
      const subfolder = rootPath.substring(0, rootPath.lastIndexOf('/'));
      const rootObject = rootPath.substring(rootPath.lastIndexOf('/')+1);
      if(subfolder) {
        callbackUrlRoot = `${callbackUrlRoot}/${subfolder}`;
      }

      const urls = [
        `${callbackUrlRoot}/${rootObject}?action=${Actions.logout}`,
      ] as string[];

      if(role == Roles.CONSENTING_PERSON) {
        urls.push(`${callbackUrlRoot}/consenting/add-exhibit-form/current/${rootObject}?action=${Actions.logout}`);
        urls.push(`${callbackUrlRoot}/consenting/add-exhibit-form/other/${rootObject}?action=${Actions.logout}`);
        urls.push(`${callbackUrlRoot}/consenting/add-exhibit-form/both/${rootObject}?action=${Actions.logout}`);
      }

      return urls;
    }

    const callbackUrls = getCallbackUrls(REDIRECT_PATH_BOOTSTRAP);
    callbackUrls.push(...getCallbackUrls(REDIRECT_PATH_WEBSITE));

    const logoutUrls = getLogoutUrls(REDIRECT_PATH_BOOTSTRAP);
    logoutUrls.push(...getLogoutUrls(REDIRECT_PATH_WEBSITE));

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