import { Construct } from 'constructs';
import { IContext } from '../contexts/IContext';
import { UserPool, UserPoolClient, AccountRecovery, StringAttribute, UserPoolClientIdentityProvider, OAuthScope } from 'aws-cdk-lib/aws-cognito';
import { HelloWorldFunction } from './HelloWorldFunction'; 
import { CognitoUserPoolsAuthorizer } from 'aws-cdk-lib/aws-apigateway';
import { Stack, CfnOutput, Duration } from 'aws-cdk-lib';

export interface CognitoProps { distribution: { domainName:string } };

export class CognitoConstruct extends Construct {

  constructId: string;
  scope: Construct;
  context: IContext;
  userPool: UserPool;
  userPoolClient: UserPoolClient;
  helloWorldApiUri: string;
  props: CognitoProps;

  constructor(scope: Construct, constructId: string, props:CognitoProps) {

    super(scope, constructId);

    this.scope = scope;
    this.constructId = constructId;
    this.context = scope.node.getContext('stack-parms');
    this.props = props;

    this.buildResources();
  }

  buildResources(): void {

    this.userPool = new UserPool(this, `${this.constructId}-userpool`, {
      userPoolName: `${this.constructId}-userpool`,
      accountRecovery: AccountRecovery.EMAIL_AND_PHONE_WITHOUT_MFA,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(7)
      },
      customAttributes: {
        email: new StringAttribute(),
        phone: new StringAttribute({ mutable: true })
      },
    });

    this.userPoolClient = this.userPool.addClient(`${this.constructId}-userpoolclient`, {
      userPoolClientName: `${this.constructId}-userpoolclient`,
      supportedIdentityProviders: [ UserPoolClientIdentityProvider.COGNITO ],
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false
        },
        scopes: [
          // TODO: Figure out what these actually do - read up on scopes.
          OAuthScope.EMAIL, OAuthScope.PHONE, OAuthScope.PROFILE
        ],
        callbackUrls: [
          'http://localhost:3000/index.htm',
          'http://localhost:3000/index.htm?action=login',
          `${this.props.distribution.domainName}/index.htm`,
          `${this.props.distribution.domainName}/index.htm?action=login`,
        ],
        logoutUrls: [
          'http://localhost:3000/index.htm?action=logout',
          `${this.props.distribution.domainName}/index.htm?action=logout`,
        ]
      },
      accessTokenValidity: Duration.days(1),
      refreshTokenValidity: Duration.days(7),
      authSessionValidity: Duration.minutes(5)
    });

    this.userPool.addDomain(`${this.constructId}-domain`, {
      cognitoDomain: {
        domainPrefix: `${this.context.STACK_ID}-${this.context.TAGS.Landscape}`
      }
    });

    const authorizer = new CognitoUserPoolsAuthorizer(this, `${this.constructId}-authorizer`, {
      authorizerName: `${this.constructId}-authorizer`,
      cognitoUserPools: [ this.userPool ],
      identitySource: 'method.request.header.Authorization',
    });

    // Create a simple test api endpoint with backing lambda for testing out the authorizer.
    const helloWorldFunction = new HelloWorldFunction(this, `${this.constructId}-lambda-helloworld`);
    this.helloWorldApiUri = helloWorldFunction.createAuthorizedResource('hello-world', authorizer);

    // Output the CloudFront distribution endpoint
    if( this.scope instanceof Stack) {
      new CfnOutput((<Stack> this.scope), 'UserPoolProviderUrl', {
        value: this.userPool.userPoolProviderUrl,
        description: 'User pool provider URL'
      });
      new CfnOutput((<Stack> this.scope), 'HelloWorldApiUri', {
        value: this.helloWorldApiUri,
        description: 'Hello world api uri, just for testing access.'
      });

    };
    
  }

  public getUserPool(): UserPool {
    return this.userPool;
  }

  public getUserPoolClient(): UserPoolClient {
    return this.userPoolClient;
  }

  public getHelloWorldApiUri(): string {
    return this.helloWorldApiUri;
  }
};
