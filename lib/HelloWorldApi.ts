import { OAuthScope, ResourceServerScope, UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import { AbstractFunction } from "./AbstractFunction";
import { Construct } from "constructs";
import { Code, Runtime } from "aws-cdk-lib/aws-lambda";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { AccessLogFormat, CognitoUserPoolsAuthorizer, Cors, LambdaIntegration, LogGroupLogDestination, MethodLoggingLevel, RestApi } from "aws-cdk-lib/aws-apigateway";
import { EttUserPoolClient } from "./CognitoUserPoolClient";

export interface HelloWorldParms {
  userPool: UserPool, 
  cloudfrontDomain: string
}

export class HelloWorldApi extends AbstractFunction {

  restApiUrl: string;
  userPoolClient: UserPoolClient;

  constructor(scope: Construct, constructId: string, parms: HelloWorldParms) {

    super(scope, constructId, {
      runtime: Runtime.NODEJS_18_X,
      handler: 'index.handler',
      functionName: constructId,
      description: 'Just a simple lambda for testing cognito authorization',
      cleanup: true,
      code: Code.fromInline(`
      exports.handler = async (event) => {
        console.log(JSON.stringify(event, null, 2));

        // https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-output-format
        const response = {
          isBase64Encoded: false,
          statusCode: 200,
          headers: {
              "Access-Control-Allow-Headers" : "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent",
              "Access-Control-Allow-Origin": "https://${parms.cloudfrontDomain}",
              "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
              "Access-Control-Allow-Credentials": "true"
          },
          body: JSON.stringify('Hello from lambda function!'),
        };
  
        return response;
      };
    `)
    });


    const stageName = this.context.TAGS.Landscape;
    const { userPool, cloudfrontDomain } = parms;

    const log_group = new LogGroup(this, `RestApiLogGroup`, {
      logGroupName: `/aws/lambda/${this.constructId}-RestApiLogGroup`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const authorizer = new CognitoUserPoolsAuthorizer(this, 'UserPoolAuthorizer', {
      authorizerName: `${this.constructId}-authorizer`,
      cognitoUserPools: [ userPool ],
      identitySource: 'method.request.header.Authorization',
    });

    const integration = new LambdaIntegration(this, { proxy: true });

    const api = new RestApi(this, `LambdaRestApi`, {
      description: `Simple hello world api for initial proving of authentication and scopes`,
      restApiName: `hello-world-rest-api-${stageName}`,
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
        allowMethods: [ 'POST', 'GET', 'OPTIONS' ],
        maxAge: Duration.minutes(10),
        allowCredentials: true
      }
    });
    
    const resourceId = 'hello-world'
    const resourceServerId = `${resourceId}-users`;
    const readOnlyScope = new ResourceServerScope({ scopeName: 'read', scopeDescription: 'Read-only access' });
    const fullAccessScope = new ResourceServerScope({ scopeName: 'full-access', scopeDescription: 'Full access' });

    const endpointResource = api.root.addResource(resourceId);

    endpointResource.addMethod('POST', integration, { 
      authorizer,
      authorizationScopes: [ 
        `${resourceServerId}/${readOnlyScope.scopeName}`, 
        `${resourceServerId}/${fullAccessScope.scopeName}` 
      ],
      requestParameters: {
        'method.request.path.proxy': true
      }
    });   

    endpointResource.addMethod('GET', integration, { 
      authorizer,
      authorizationScopes: [ 
        `${resourceServerId}/${readOnlyScope.scopeName}`, 
        `${resourceServerId}/${fullAccessScope.scopeName}` 
      ],
      requestParameters: {
        'method.request.path.proxy': true
      }
    });

    const helloWorldServer = userPool.addResourceServer('HelloWorldResourceServer', {
      identifier: resourceServerId,
      userPoolResourceServerName: `${this.constructId}-resource-server`,
      scopes: [ readOnlyScope, fullAccessScope ]
    });

    this.restApiUrl = `${api.urlForPath('/hello-world')}`;

    this.userPoolClient = EttUserPoolClient.buildCustomScopedClient(userPool, 'hello-world', {
      callbackDomainName: cloudfrontDomain,
      customScopes: [ OAuthScope.resourceServer(helloWorldServer, readOnlyScope) ],
    });
  }

  public getRestApiUrl(): string {
    return this.restApiUrl;
  }

  public getUserPoolClientId(): string {
    return this.userPoolClient.userPoolClientId;
  }
}