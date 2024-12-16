import { Duration } from "aws-cdk-lib";
import { OAuthScope, UserPool, UserPoolClient, UserPoolClientIdentityProvider, UserPoolClientProps } from "aws-cdk-lib/aws-cognito";
import { IContext } from "../contexts/IContext";
import { CallbackUrlFactory } from "./lambda/_lib/cognito/CallbackUrls";
import { Role } from './lambda/_lib/dao/entity';

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

    let factory = new CallbackUrlFactory(callbackDomainName, REDIRECT_PATH_BOOTSTRAP, role);
    // Urls to the app location that cognito will "callback" or redirect to upon successful signin.
    const callbackUrls = factory.getCallbackUrls();
    // Urls to the app location that cognito will redirect to upon successful signout
    const logoutUrls = factory.getLogoutUrls();

    factory = new CallbackUrlFactory(callbackDomainName, REDIRECT_PATH_WEBSITE, role);
    callbackUrls.push(...factory.getCallbackUrls());
    logoutUrls.push(...factory.getLogoutUrls())

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