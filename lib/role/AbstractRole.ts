import { CfnUserPoolUICustomizationAttachment, OAuthScope, ResourceServerScope, UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import { IContext } from "../../contexts/IContext";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { AccessLogFormat, CognitoUserPoolsAuthorizer, Cors, LambdaIntegration, LogGroupLogDestination, MethodLoggingLevel, RestApi } from "aws-cdk-lib/aws-apigateway";
import { Function } from 'aws-cdk-lib/aws-lambda';
import { EttUserPoolClient } from "../CognitoUserPoolClient";
import { Role } from '../lambda/dao/entity';

export interface ApiParms {
  userPool: UserPool, 
  cloudfrontDomain: string,
  lambdaFunction: Function,
  role: Role,
  description: string,
  bannerImage: string,
  resourceId: string,
  scopes: ResourceServerScope[],
  methods: string[],
}

/**
 * This class serves as a baseline for a role, upon which broad division for api access for the app is based -
 * that is, what kind of user is logged in through cognito (or a private super user). 
 * This class creates for the role an api, lambda function, user pool client, and oauth integration. 
 * All default settings can be overridden by subclasses.
 */
export class AbstractRoleApi extends Construct {

  private restApiUrl: string;
  private userPoolClient: UserPoolClient;
  private lambdaFunction: Function;
  
  constructor(scope: Construct, constructId: string, parms: ApiParms) {

    super(scope, constructId);
    
    const context: IContext = scope.node.getContext('stack-parms');
    const stageName = context.TAGS.Landscape;
    const { userPool, cloudfrontDomain, lambdaFunction, role, role:resourceServerId, description, bannerImage, resourceId, scopes, methods } = parms;
    this.lambdaFunction = lambdaFunction;

    // Create a log group for the api gateway to log to.
    const log_group = new LogGroup(this, `RestApiLogGroup`, {
      logGroupName: `/aws/lambda/${constructId}RestApiLogGroup`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Create the api gateway REST api.
    const api = new RestApi(this, `LambdaRestApi`, {
      description,
      restApiName: `${role}-rest-api-${stageName}`,
      deployOptions: { 
        stageName,
        accessLogDestination: new LogGroupLogDestination(log_group),
        accessLogFormat: AccessLogFormat.clf(),
        loggingLevel: MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        description
      },      
      defaultCorsPreflightOptions: {
        allowOrigins: [ `https://${cloudfrontDomain}` ],
        allowHeaders: Cors.DEFAULT_HEADERS,
        allowMethods: [ 'POST', 'GET', 'OPTIONS' ],
        maxAge: Duration.minutes(10),
        allowCredentials: true
      }
    });
    
    // Add a resource. This will be the resource "path" portion of the api. Example:
    // https://ud8xqc84ha.execute-api.us-east-2.amazonaws.com/[stage]/[path]
    const endpointResource = api.root.addResource(resourceId);
    const authorizationScopes: string[] = scopes.map((scope: ResourceServerScope) => {
      return `${resourceServerId}/${scope.scopeName}`;
    });
    this.restApiUrl = api.urlForPath(`/${resourceId}`);

    // Let the cognito user pool control access to the api. Add an api gateway authorizer of type "COGNITO_USER_POOLS"
    const authorizer = new CognitoUserPoolsAuthorizer(this, 'UserPoolAuthorizer', {
      authorizerName: `${constructId}-authorizer`,
      cognitoUserPools: [ userPool ],
      identitySource: 'method.request.header.Authorization',
    });

    // Configure each api gateway method to use the authorizer.
    const integration = new LambdaIntegration(lambdaFunction, { proxy: true });
    methods.forEach(method => {
      endpointResource.addMethod(method, integration, { 
        authorizer,
        authorizationScopes,
        requestParameters: {
          'method.request.path.proxy': true
        }
      });        
    });

    // Add an OAuth 2.0 API server that verifies the request issuer based on the token signature, 
    // validity based on token expiration, and access level based on the scopes in token claims
    const resourceServer = userPool.addResourceServer(`${constructId}ResourceServer`, {
      identifier: resourceServerId,
      userPoolResourceServerName: `${resourceServerId}-resource-server`,
      scopes
    });

    // Create a user pool client for this role and its scopes.
    this.userPoolClient = EttUserPoolClient.buildCustomScopedClient(userPool, role, {
      callbackDomainName: cloudfrontDomain,
      role,
      customScopes: scopes.map((scope: ResourceServerScope) => {
        return OAuthScope.resourceServer(resourceServer, scope)
      }),
    });

    /**
     * Adding a custom logo image is problematic with cloudformation: https://github.com/aws/aws-cdk/issues/6953.
     * However, the css of the top banner can be modified to point at an image url, so that is just as good.
     */
    new CfnUserPoolUICustomizationAttachment(
      this,
      `${constructId}UIAttachment`,
      {
        clientId: this.userPoolClient.userPoolClientId,
        userPoolId: userPool.userPoolId,
        css: `
          .banner-customizable {
            background-position-x: 10px;
            background-position-y: 5px;
            background-repeat: no-repeat;
            background-size: 230px;
            background-color: white;
            background-image: url('https://${cloudfrontDomain}/${bannerImage}');
          }
        `        
        // css: fs.readFileSync('./cognito-hosted-ui.css').toString('utf-8')
      }
    );
  }

  public getRestApiUrl(): string {
    return this.restApiUrl;
  }

  public getUserPoolClientId(): string {
    return this.userPoolClient.userPoolClientId;
  }

  public getLambdaFunction(): Function {
    return this.lambdaFunction;
  }
}