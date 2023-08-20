import { Construct } from 'constructs';
import { Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { AbstractFunction } from './AbstractFunction';
import { RestApi, LambdaIntegration, Cors, CognitoUserPoolsAuthorizer, LogGroupLogDestination, AccessLogFormat, MethodLoggingLevel, IntegrationResponse } from 'aws-cdk-lib/aws-apigateway';
import { OAuthScope, ResourceServerScope, UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { EttUserPoolClient } from './CognitoUserPoolClient';

export class HelloWorldFunction extends AbstractFunction {

  restApiUrl: string;

  constructor(scope: Construct, constructId: string) {

    super(scope, constructId, {
      runtime: Runtime.NODEJS_18_X,
      handler: 'index.handler',
      functionName: constructId,
      description: 'Just a simple lambda for testing cognito authorization',
      cleanup: true,
      code: Code.fromInline(`
        exports.handler = async (event) => {
          console.log(JSON.stringify(event, null, 2));
          return {
            statusCode: 200,
            {},
            { message: "howdy!" },
          };
        };
      `)
    });
  };

  public createAuthorizedResource(resourcePath: string, userPool: UserPool, cloudfrontDomain: string): UserPoolClient {

    const stageName = this.context.TAGS.Landscape;

    const log_group = new LogGroup(this, `RestApiLogGroup`, {
      logGroupName: `/aws/lambda/${this.constructId}-RestApiLogGroup`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const authorizer = new CognitoUserPoolsAuthorizer(this, 'UserPoolAuthorizer', {
      authorizerName: `${this.constructId}-authorizer`,
      cognitoUserPools: [ userPool ],
      identitySource: 'method.request.header.Authorization',
    });

    const integration = new LambdaIntegration(this);

    const api = new RestApi(this, 'RestApi', {
      description: `Simple hello world api for initial proving of authentication and scopes`,
      deployOptions: { 
        stageName,
        accessLogDestination: new LogGroupLogDestination(log_group),
        accessLogFormat: AccessLogFormat.clf(),
        loggingLevel: MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        description: 'Rest API for to be integrated with lambda for testing cognito authorization'
      },
      defaultCorsPreflightOptions: {
        allowOrigins: [ `https://${cloudfrontDomain}` ],
        allowHeaders: Cors.DEFAULT_HEADERS,
        allowMethods: [ 'POST', 'GET' ],
        maxAge: Duration.minutes(10),
        allowCredentials: true
      },
      defaultIntegration: integration
    });


    const endpointResource = api.root.addResource(resourcePath);
    const postMethod = endpointResource.addMethod('POST', integration, { authorizer });    
    const getMethod = endpointResource.addMethod('GET', integration, { authorizer });
    
    const readOnlyScope = new ResourceServerScope({ scopeName: 'read', scopeDescription: 'Read-only access' });
    const fullAccessScope = new ResourceServerScope({ scopeName: 'full-access', scopeDescription: 'Full access' });


    const helloWorldServer = userPool.addResourceServer('HelloWorldResourceServer', {
      identifier: 'hello-world-users',
      userPoolResourceServerName: `${this.constructId}-resource-server`,
      scopes: [ readOnlyScope, fullAccessScope ]
    });

    this.restApiUrl = `${api.urlForPath(endpointResource.path)}`;

    return EttUserPoolClient.buildCustomScopedClient(userPool, 'hello-world', {
      callbackDomainName: cloudfrontDomain,
      customScopes: [ OAuthScope.resourceServer(helloWorldServer, readOnlyScope) ],
    });
  }

  public getRestApiUrl(): string {
    return this.restApiUrl;
  }
}