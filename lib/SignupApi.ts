import { Duration } from "aws-cdk-lib";
import { LambdaRestApi } from "aws-cdk-lib/aws-apigateway";
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { IContext } from "../contexts/IContext";
import { AbstractFunction } from "./AbstractFunction";
import { DynamoDbConstruct } from "./DynamoDb";
import { UserPool } from "aws-cdk-lib/aws-cognito";

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
  private acknowledgeEntityLambda:AbstractFunction;
  private registerEntityLambda:AbstractFunction;
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
  }

  private createAcknowledgeEntityApi = () => {
    const { constructId, parms: { cloudfrontDomain }, stageName, context: { REGION } } = this;
    const basename = `${constructId}AcknowledgeEntity`;
    const description = 'for checking invitation code and registering a new user has acknowledged privacy policy';

    // Create the lambda function
    this.acknowledgeEntityLambda = new class extends AbstractFunction { }(this, basename, {
      runtime: Runtime.NODEJS_18_X,
      entry: 'lib/lambda/functions/signup/EntityAcknowledgement.ts',
      // handler: 'handler',
      functionName: `Ett${basename}`,
      description: `Function ${description}`,
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      environment: {
        REGION,
        DYNAMODB_USER_TABLE_NAME: DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME,
        DYNAMODB_INVITATION_TABLE_NAME: DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME,
        DYNAMODB_ENTITY_TABLE_NAME: DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME,
        DYNAMODB_CONSENTER_TABLE_NAME: DynamoDbConstruct.DYNAMODB_CONSENTER_TABLE_NAME,
        CLOUDFRONT_DOMAIN: cloudfrontDomain
      }
    });

    // Create the rest api
    const api = new LambdaRestApi(this, `${basename}LambdaRestApi`, {
      deployOptions: {
        description: `API ${description}`,
        stageName
      },
      restApiName: `Ett-${basename}-rest-api`,
      handler: this.acknowledgeEntityLambda,
      proxy: false
    });

    // Add the root resource path element of "acknowledge-entity"
    const acknowledgePath = api.root.addResource('acknowledge-entity');
    // Add the task path element
    const taskPath = acknowledgePath.addResource('{task}')
    // Add the "invitation-code" parameter as the last path element.
    const invitationCodePath = taskPath.addResource('{invitation-code}');
    invitationCodePath.addMethod('GET');   // GET /acknowledge-entity/task/{invitation-code}
    invitationCodePath.addMethod('POST');
    invitationCodePath.addCorsPreflight({
      allowOrigins: [ `https://${cloudfrontDomain}` ],
      // allowHeaders: Cors.DEFAULT_HEADERS.concat('Is a header needed?'),
      allowMethods: [ 'POST', 'GET', 'OPTIONS' ],
      maxAge: Duration.minutes(10),
      // allowCredentials: true
    });

    this._acknowledgeEntityApiUri = api.urlForPath(`/acknowledge-entity`);
  }

  private createRegisterEntityApi = () => {
    const { constructId, context: { REGION, ACCOUNT }, 
      parms: { cloudfrontDomain, userPool: { userPoolArn, userPoolId } }, stageName 
    } = this;
    const basename = `${constructId}RegisterEntity`;
    const description = 'for checking invitation code and registering a new user has signed and registered';

    // Create the lambda function
    this.registerEntityLambda = new class extends AbstractFunction { }(this, basename, {
      runtime: Runtime.NODEJS_18_X,
      entry: 'lib/lambda/functions/signup/EntityRegistration.ts',
      // handler: 'handler',
      functionName: `Ett${basename}`,
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
        DYNAMODB_USER_TABLE_NAME: DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME,
        DYNAMODB_INVITATION_TABLE_NAME: DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME,
        DYNAMODB_ENTITY_TABLE_NAME: DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME,
        DYNAMODB_CONSENTER_TABLE_NAME: DynamoDbConstruct.DYNAMODB_CONSENTER_TABLE_NAME,
        CLOUDFRONT_DOMAIN: cloudfrontDomain,
        USERPOOL_ID: userPoolId
      }
    });

    // Create the rest api
    const api = new LambdaRestApi(this, `${basename}LambdaRestApi`, {
      deployOptions: {
        description: `API ${description}`,
        stageName: stageName
      },
      restApiName: `Ett-${basename}-rest-api`,
      handler: this.registerEntityLambda,
      proxy: false
    });

    // Add the root resource path element of "register-entity"
    const registerEntityPath = api.root.addResource('register-entity');
    // Add the task path element
    const taskPath = registerEntityPath.addResource('{task}')
    // Add the "invitation-code" parameter as the last path element.
    const invitationCodePath = taskPath.addResource('{invitation-code}');
    invitationCodePath.addMethod('GET');   // GET /register-entity/task/{invitation-code}
    invitationCodePath.addMethod('POST');
    invitationCodePath.addCorsPreflight({
      allowOrigins: [ `https://${cloudfrontDomain}` ],
      // allowHeaders: Cors.DEFAULT_HEADERS.concat('Is a header needed?'),
      allowMethods: [ 'POST', 'GET', 'OPTIONS' ],
      maxAge: Duration.minutes(10),
      // allowCredentials: true
    });

    this._registerEntityApiUri = api.urlForPath('/register-entity');
  }

  public grantPermissionsTo = (dynamodb:DynamoDbConstruct) => {
    dynamodb.getInvitationsTable().grantReadWriteData(this.acknowledgeEntityLambda);
    dynamodb.getInvitationsTable().grantReadWriteData(this.registerEntityLambda);
    dynamodb.getEntitiesTable().grantReadWriteData(this.registerEntityLambda);
    dynamodb.getUsersTable().grantReadWriteData(this.registerEntityLambda);
  }

  public get entityAcknowledgeApiUri() {
    return this._acknowledgeEntityApiUri;
  }

  public get registerEntityApiUri() {
    return this._registerEntityApiUri;
  }
}
