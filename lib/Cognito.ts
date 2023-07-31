import { Construct } from 'constructs';
import { IContext } from '../contexts/IContext';
import { UserPool, UserPoolClient, AccountRecovery, StringAttribute, 
  UserPoolClientIdentityProvider, OAuthScope,  CfnUserPoolUICustomizationAttachment} from 'aws-cdk-lib/aws-cognito';
import { HelloWorldFunction } from './HelloWorldFunction'; 
import { CognitoUserPoolsAuthorizer } from 'aws-cdk-lib/aws-apigateway';
import { Stack, CfnOutput, Duration } from 'aws-cdk-lib';
import * as fs from 'fs';

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

    this.userPool = new UserPool(this, 'UserPool', {
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

    this.userPoolClient = this.userPool.addClient('Client', {
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
          `https://${this.props.distribution.domainName}/index.htm`,
          `https://${this.props.distribution.domainName}/index.htm?action=login`,
        ],
        logoutUrls: [
          'http://localhost:3000/index.htm?action=logout',
          `https://${this.props.distribution.domainName}/index.htm?action=logout`,
        ]
      },
      accessTokenValidity: Duration.days(1),
      refreshTokenValidity: Duration.days(7),
      authSessionValidity: Duration.minutes(5)
    });

    this.userPool.addDomain('Domain', {
      cognitoDomain: {
        domainPrefix: `${this.context.STACK_ID}-${this.context.TAGS.Landscape}`
      }
    });

    // TODO: figure out how to add an image for custom logo
    // https://github.com/aws/aws-cdk/issues/6953
    // https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-app-ui-customization.html
    // const uiAttachment = new CfnUserPoolUICustomizationAttachment(
    //   this,
    //   `${this.constructId}-ui-attachment`,
    //   {
    //     clientId: this.userPoolClient.userPoolClientId,
    //     userPoolId: this.userPool.userPoolId,
    //     css: fs.readFileSync('./cognito-hosted-ui.css').toString('utf-8')
    //   }
    // );

    const authorizer = new CognitoUserPoolsAuthorizer(this, 'UserPoolAuthorizer', {
      authorizerName: `${this.constructId}-authorizer`,
      cognitoUserPools: [ this.userPool ],
      identitySource: 'method.request.header.Authorization',
    });

    // Create a simple test api endpoint with backing lambda for testing out the authorizer.
    const helloWorldFunction = new HelloWorldFunction(this, 'HelloWorldLambda');
    // helloWorldFunction.preventOrphanedLogs();
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
