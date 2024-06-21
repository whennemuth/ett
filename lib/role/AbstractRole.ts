import { CfnUserPoolUICustomizationAttachment, OAuthScope, ResourceServerScope, UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import { IContext } from "../../contexts/IContext";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { AccessLogFormat, CognitoUserPoolsAuthorizer, Cors, LambdaIntegration, LogGroupLogDestination, MethodLoggingLevel, RestApi, RestApiProps } from "aws-cdk-lib/aws-apigateway";
import { Function } from 'aws-cdk-lib/aws-lambda';
import { EttUserPoolClient } from "../CognitoUserPoolClient";
import { Role } from '../lambda/_lib/dao/entity';

export interface ApiParms {
  userPool: UserPool, 
  cloudfrontDomain: string,
  lambdaFunction: Function,
  role: Role,
  roleFullName: string,
  description: string,
  bannerImage: string,
  resourceId: string,
  scopes: ResourceServerScope[],
  methods: string[],
}

export enum Actions {
  login = 'login',
  logout = 'logout',
  post_signup = 'post-signup',
  acknowledge_entity = 'acknowledge-entity',
  register_entity = 'register-entity',
  acknowledge_consenter = 'acknowledge-consenter',
  register_consenter = 'register-consenter'
};

/**
 * This is the type expected by lambda functions for incoming api calls, where the ETTPayloadHeader 
 * contains a json object that, when parsed, will produce an object that reflects this type.
 */
export type IncomingPayload = {
  task:string,
  parameters: any
}

export type OutgoingBody = {
  message:string,
  payload?:any
}

/**
 * This is the type that brings api responses into compliance with lambda proxy integration.
 * SEE: https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-integration-settings-integration-response.html
 */
export type LambdaProxyIntegrationResponse = {
  isBase64Encoded?:boolean,
  statusCode:number,
  statusDescription?:string,
  headers?:any,
  body?:string
}

/**
 * This class serves as a baseline for a role, upon which broad division for api access for the app is based -
 * that is, what kind of user is logged in through cognito (or a private super user). 
 * This class creates for the role an api(s), lambda function, user pool client, and oauth integration. 
 * All default settings can be overridden by subclasses.
 */
export class AbstractRoleApi extends Construct {

  private restApiUrl: string;
  private userPoolClient: UserPoolClient;
  private lambdaFunction: Function;
  private role: Role;
  private roleFullName: string;

  /** Name of the header in incoming api call requests for task specific parameters. 
   * NOTE: Must be lowercase, because api gateway will convert it to lowercase and any lambda function
   * event object will access it that way.
   */
  public static ETTPayloadHeader = 'ettpayload';
  
  constructor(scope: Construct, constructId: string, parms: ApiParms) {

    super(scope, constructId);
    
    const context: IContext = scope.node.getContext('stack-parms');
    const stageName = context.TAGS.Landscape;
    const { userPool, cloudfrontDomain, lambdaFunction, role, role:resourceServerId, roleFullName, description, bannerImage, resourceId, scopes, methods } = parms;
    this.role = role;
    this.roleFullName = roleFullName;
    this.lambdaFunction = lambdaFunction;

    // Create a log group for the api gateway to log to.
    const log_group = new LogGroup(this, `RestApiLogGroup`, {
      logGroupName: `/aws/lambda/${constructId}RestApiLogGroup`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Create the api gateway REST api.
    const api = new RestApi(this, `LambdaRestApi`, {
      description,
      restApiName: `Ett-${role}-rest-api-${stageName}`,
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
        allowHeaders: Cors.DEFAULT_HEADERS.concat([AbstractRoleApi.ETTPayloadHeader]),
        allowMethods: [ 'POST', 'GET', 'OPTIONS' ],
        maxAge: Duration.minutes(10),
        allowCredentials: true
      }
    } as RestApiProps);
    
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

  public getRole(): Role {
    return this.role;
  }

  public getRoleFullName(): string {
    return this.roleFullName;
  }
}

export abstract class AbstractRole extends Construct {
  public abstract getApi(): AbstractRoleApi;
  public abstract getLambdaFunction(): Function;
}