import { Duration } from "aws-cdk-lib";
import { IUserPoolClient, OAuthScope, UserPool, UserPoolClient, UserPoolClientIdentityProvider, UserPoolClientProps } from "aws-cdk-lib/aws-cognito";

export interface EttUserPoolClientProps { callbackDomainName:string, customScopes?:OAuthScope[] }

/**
 * Static factory class for producing a UserPoolClients universal characteristics preset, but custom scopes injected. 
 */
export class EttUserPoolClient extends UserPoolClient {
  
  constructor(userPool: UserPool, id: string, props: UserPoolClientProps) {    
    super(userPool, `${id}-userpool-client`, props);
  }

  public static buildCustomScopedClient(userPool: UserPool, id: string, props: EttUserPoolClientProps): UserPoolClient {
    
    let scopes:OAuthScope[] = [ OAuthScope.EMAIL, OAuthScope.PHONE, OAuthScope.PROFILE ];
    if(props.customScopes) {
      scopes = scopes.concat(props.customScopes);
    }

    return new EttUserPoolClient(userPool, id, {
      userPool,
      supportedIdentityProviders: [ UserPoolClientIdentityProvider.COGNITO ],
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false
        },
        scopes,
        callbackUrls: [
          `https://${props.callbackDomainName}/index.htm`,
          `https://${props.callbackDomainName}/index.htm?action=login`,
          `https://${props.callbackDomainName}/index.htm?action=signedup`,
        ],
        logoutUrls: [
          `https://${props.callbackDomainName}/index.htm?action=logout`,
        ]
      },
      accessTokenValidity: Duration.days(1),
      idTokenValidity: Duration.days(1),
      refreshTokenValidity: Duration.days(7),
      authSessionValidity: Duration.minutes(5)
    })
  }
}