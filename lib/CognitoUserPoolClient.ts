import { Duration } from "aws-cdk-lib";
import { OAuthScope, UserPool, UserPoolClient, UserPoolClientIdentityProvider, UserPoolClientProps } from "aws-cdk-lib/aws-cognito";
import { Role, Roles } from './lambda/_lib/dao/entity';
import { Actions } from "./role/AbstractRole";

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
    
    let scopes:OAuthScope[] = [ OAuthScope.EMAIL, OAuthScope.PHONE, OAuthScope.PROFILE ];
    const {customScopes, callbackDomainName, role } = props;
    if(customScopes) {
      scopes = scopes.concat(customScopes);
    }

    const client = new EttUserPoolClient(userPool, id, {
      userPool,
      userPoolClientName: `${role}-ett-userpool-client`,
      supportedIdentityProviders: [ UserPoolClientIdentityProvider.COGNITO ],
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false
        },
        scopes,
        callbackUrls: [
          `https://${callbackDomainName}/index.htm`,
          `https://${callbackDomainName}/index.htm?action=${Actions.login}&selected_role=${role}`,
          `https://${callbackDomainName}/index.htm?action=${Actions.post_signup}&selected_role=${role}`,
        ],
        logoutUrls: [
          `https://${callbackDomainName}/index.htm?action=${Actions.logout}`,
        ]
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