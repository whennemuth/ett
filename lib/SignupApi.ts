import { Duration } from "aws-cdk-lib";
import { Cors, LambdaRestApi } from "aws-cdk-lib/aws-apigateway";
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { IContext } from "../contexts/IContext";
import { AbstractFunction } from "./AbstractFunction";
import { DynamoDbConstruct } from "./DynamoDb";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { AbstractRoleApi, Actions } from "./role/AbstractRole";
import { Configurations } from "./lambda/_lib/config/Config";

export type SignupApiConstructParms = {
  userPool: UserPool,
  cloudfrontDomain: string
};

/**
 * Construct for all api gateways and integrated lambda functions for pre-cognito signup activity (
 * privacy policy acknowledgement & registration).
 */
export class SignupApiConstruct extends Construct {

  private outerScope:Construct;
  private constructId:string;
  private stageName:string;
  private _acknowledgeEntityApiUri:string;
  private _registerEntityApiUri:string;
  private _registerConsenterApiUri:string;
  private acknowledgeEntityLambda:AbstractFunction;
  private registerEntityLambda:AbstractFunction;
  private registerConsenterLambda:AbstractFunction;
  private context:IContext;
  private parms:SignupApiConstructParms;

  constructor(scope:Construct, constructId:string, parms:SignupApiConstructParms) {
    super(scope, constructId);

    this.outerScope = scope;
    this.constructId = constructId;
    this.parms = parms;
    this.context = scope.node.getContext('stack-parms');
    this.stageName = this.context.TAGS.Landscape;

    this.createAcknowledgeEntityApi();

    this.createRegisterEntityApi();

    this.createRegisterConsenterApi();
  }

  /**
   * Create the lambda function and api for checking invitation code and registering a new user has acknowledged privacy policy.
   */
  private createAcknowledgeEntityApi = () => {
    const { constructId, parms: { cloudfrontDomain }, stageName, context: { REGION, CONFIG, TAGS: { Landscape:landscape } } } = this;
    const basename = `${constructId}AcknowledgeEntity`;
    const description = 'for checking invitation code and registering a new user has acknowledged privacy policy';

    // Create the lambda function
    this.acknowledgeEntityLambda = new class extends AbstractFunction { }(this, basename, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
      entry: 'lib/lambda/functions/signup/EntityAcknowledgement.ts',
      // handler: 'handler',
      functionName: `ett-${landscape}-signup-acknowledge-entity-lambda`,
      description: `Function ${description}`,
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      environment: {
        REGION,
        CLOUDFRONT_DOMAIN: cloudfrontDomain,
        [Configurations.ENV_VAR_NAME]: new Configurations(CONFIG).getJson()
      }
    });

    // Create the rest api
    const api = new LambdaRestApi(this, `${basename}LambdaRestApi`, {
      deployOptions: {
        description: `API ${description}`,
        stageName
      },
      restApiName: `ett-${landscape}-signup-acknowledge-entity-rest-api`,
      handler: this.acknowledgeEntityLambda,
      proxy: false
    });

    // Add the root resource path element of ${Actions.acknowledge_entity}
    const acknowledgePath = api.root.addResource(Actions.acknowledge_entity);
    // Add the task path element
    const taskPath = acknowledgePath.addResource('{task}')
    // Add the "invitation-code" parameter as the last path element.
    const invitationCodePath = taskPath.addResource('{invitation-code}');
    invitationCodePath.addMethod('GET');   // GET /${Actions.acknowledge_entity}/task/{invitation-code}
    invitationCodePath.addMethod('POST');
    invitationCodePath.addCorsPreflight({
      allowOrigins: [ `https://${cloudfrontDomain}` ],
      // allowHeaders: Cors.DEFAULT_HEADERS.concat('Is a header needed?'),
      allowMethods: [ 'POST', 'GET', 'OPTIONS' ],
      maxAge: Duration.minutes(10),
      // allowCredentials: true
    });

    this._acknowledgeEntityApiUri = api.urlForPath(`/${Actions.acknowledge_entity}`);
  }

  /**
   * Create the lambda function and api for for checking invitation code and registering a new user has signed and registered.
   */
  private createRegisterEntityApi = () => {
    const { constructId, context: { REGION, ACCOUNT, CONFIG, TAGS: { Landscape:landscape } }, 
      parms: { cloudfrontDomain, userPool: { userPoolArn, userPoolId } }, stageName 
    } = this;
    const basename = `${constructId}RegisterEntity`;
    const description = 'for checking invitation code and registering a new user has signed and registered';

    // Create the lambda function
    this.registerEntityLambda = new class extends AbstractFunction { }(this, basename, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
      entry: 'lib/lambda/functions/signup/EntityRegistration.ts',
      // handler: 'handler',
      functionName: `ett-${landscape}-signup-register-entity-lambda`,
      description: `Function ${description}`,
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(this, 'RegisterEntityApiRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        description: `Grants actions to the entity registration api lambda function to perform the related api tasks.`,
        inlinePolicies: {
          'EttAuthIndSesPolicy': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'ses:Send*', 'ses:Get*' ],
                resources: [
                  `arn:aws:ses:${REGION}:${ACCOUNT}:identity/*`
                ],
                effect: Effect.ALLOW
              })
            ]
          }),
          'EttAuthIndCognitoPolicy': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [  'cognito-idp:List*'  ],
                resources: [ '*' ],
                effect: Effect.ALLOW
              }),
              new PolicyStatement({
                actions: [  'cognito-idp:AdminGet*', 'cognito-idp:AdminDeleteUser' ],
                resources: [ userPoolArn ],
                effect: Effect.ALLOW
              })
            ]
          })
        }
      }),
      environment: {
        REGION,
        CLOUDFRONT_DOMAIN: cloudfrontDomain,
        USERPOOL_ID: userPoolId,
        [Configurations.ENV_VAR_NAME]: new Configurations(CONFIG).getJson()
      }
    });

    // Create the rest api
    const api = new LambdaRestApi(this, `${basename}LambdaRestApi`, {
      deployOptions: {
        description: `API ${description}`,
        stageName: stageName
      },
      restApiName: `ett-${landscape}-signup-register-entity-rest-api`,
      handler: this.registerEntityLambda,
      proxy: false
    });

    // Add the root resource path element of "${Actions.register_entity}"
    const registerEntityPath = api.root.addResource(Actions.register_entity);
    // Add the task path element
    const taskPath = registerEntityPath.addResource('{task}')
    // Add the "invitation-code" parameter as the last path element.
    const invitationCodePath = taskPath.addResource('{invitation-code}');
    invitationCodePath.addMethod('GET');   // GET /${Actions.register_entity}/task/{invitation-code}
    invitationCodePath.addMethod('POST');
    invitationCodePath.addCorsPreflight({
      allowOrigins: [ `https://${cloudfrontDomain}` ],
      // allowHeaders: Cors.DEFAULT_HEADERS.concat('Is a header needed?'),
      allowMethods: [ 'POST', 'GET', 'OPTIONS' ],
      maxAge: Duration.minutes(10),
      // allowCredentials: true
    });

    this._registerEntityApiUri = api.urlForPath(`/${Actions.register_entity}`);
  }

  /**
   * Create the public registration lambda function and api for the first stage of consenter registration
   */
  private createRegisterConsenterApi = () => {
    const { constructId, parms: { cloudfrontDomain }, stageName, context: { REGION, CONFIG, TAGS: { Landscape:landscape } } } = this;
    const basename = `${constructId}RegisterConsenter`;
    const description = 'for the first stage of public registration of a consenting person';

    // Create the lambda function
    this.registerConsenterLambda = new class extends AbstractFunction { }(this, basename, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
      entry: 'lib/lambda/functions/signup/ConsenterRegistration.ts',
      // handler: 'handler',
      functionName: `ett-${landscape}-signup-register-consenter-lambda`,
      description: `Function ${description}`,
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      environment: {
        REGION,
        CLOUDFRONT_DOMAIN: cloudfrontDomain,
        [Configurations.ENV_VAR_NAME]: new Configurations(this.context.CONFIG).getJson()
      }
    });

    // Create the rest api
    const api = new LambdaRestApi(this, `${basename}LambdaRestApi`, {
      deployOptions: {
        description: `API ${description}`,
        stageName
      },
      restApiName: `ett-${landscape}-signup-register-consenter-rest-api`,
      handler: this.registerConsenterLambda,
      proxy: false
    });

    // Add the root resource path element of "${Actions.register_consenter}"
    const acknowledgePath = api.root.addResource(Actions.register_consenter);
    acknowledgePath.addMethod
    acknowledgePath.addMethod('GET');   // GET /${Actions.register_consenter}
    acknowledgePath.addMethod('POST');
    acknowledgePath.addCorsPreflight({
      allowOrigins: [ `https://${cloudfrontDomain}` ],
      allowHeaders: Cors.DEFAULT_HEADERS.concat([AbstractRoleApi.ETTPayloadHeader]),
      allowMethods: [ 'POST', 'GET', 'OPTIONS' ],
      maxAge: Duration.minutes(10),
      // allowCredentials: true
    });

    this._registerConsenterApiUri = api.urlForPath(`/${Actions.register_consenter}`);
  }

  public grantPermissionsTo = (dynamodb:DynamoDbConstruct) => {
    dynamodb.getInvitationsTable().grantReadWriteData(this.acknowledgeEntityLambda);
    dynamodb.getInvitationsTable().grantReadWriteData(this.registerEntityLambda);
    dynamodb.getEntitiesTable().grantReadWriteData(this.registerEntityLambda);
    dynamodb.getUsersTable().grantReadWriteData(this.registerEntityLambda);
    dynamodb.getConsentersTable().grantReadWriteData(this.registerConsenterLambda);
    dynamodb.getConfigTable().grantReadData(this.acknowledgeEntityLambda);
    dynamodb.getConfigTable().grantReadData(this.registerEntityLambda);
    dynamodb.getConfigTable().grantReadData(this.registerConsenterLambda);
  }

  public get entityAcknowledgeApiUri() {
    return this._acknowledgeEntityApiUri;
  }

  public get registerEntityApiUri() {
    return this._registerEntityApiUri;
  }

  public get registerConsenterApiUri() {
    return this._registerConsenterApiUri;
  }
}
