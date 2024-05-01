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
 * privacy policy acknowledgement & consent).
 */
export class SignupApiConstruct extends Construct {

  private outerScope:Construct;
  private constructId:string;
  private stageName:string;
  private _acknowledgementApiUri:string;
  private _consentApiUri:string;
  private acknowledgeLambda:AbstractFunction;
  private consentLambda:AbstractFunction;
  private context:IContext;
  private parms:SignupApiConstructParms;

  constructor(scope:Construct, constructId:string, parms:SignupApiConstructParms) {
    super(scope, constructId);

    this.outerScope = scope;
    this.constructId = constructId;
    this.parms = parms;
    this.context = scope.node.getContext('stack-parms');
    this.stageName = this.context.TAGS.Landscape;

    this.createAcknowledgementApi();

    this.createConsentApi();
  }

  private createAcknowledgementApi = () => {
    const basename = `${this.constructId}Acknowledgement`;
    const description = 'for checking invitation code and registering a new user has acknowledged privacy policy';

    // Create the lambda function
    this.acknowledgeLambda = new class extends AbstractFunction { }(this, basename, {
      runtime: Runtime.NODEJS_18_X,
      entry: 'lib/lambda/functions/signup/Acknowledgement.ts',
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
        REGION: this.context.REGION,
        DYNAMODB_USER_TABLE_NAME: DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME,
        DYNAMODB_INVITATION_TABLE_NAME: DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME,
        DYNAMODB_ENTITY_TABLE_NAME: DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME,
        DYNAMODB_CONSENTER_TABLE_NAME: DynamoDbConstruct.DYNAMODB_CONSENTER_TABLE_NAME,
        CLOUDFRONT_DOMAIN: this.parms.cloudfrontDomain
      }
    });

    // Create the rest api
    const api = new LambdaRestApi(this, `${basename}LambdaRestApi`, {
      deployOptions: {
        description: `API ${description}`,
        stageName: this.stageName
      },
      restApiName: `Ett-${basename}-rest-api`,
      handler: this.acknowledgeLambda,
      proxy: false
    });

    // Add the root resource path element of "acknowledge"
    const acknowledgePath = api.root.addResource('acknowledge');
    // Add the task path element
    const taskPath = acknowledgePath.addResource('{task}')
    // Add the "invitation-code" parameter as the last path element.
    const invitationCodePath = taskPath.addResource('{invitation-code}');
    invitationCodePath.addMethod('GET');   // GET /acknowledge/task/{invitation-code}
    invitationCodePath.addMethod('POST');
    invitationCodePath.addCorsPreflight({
      allowOrigins: [ `https://${this.parms.cloudfrontDomain}` ],
      // allowHeaders: Cors.DEFAULT_HEADERS.concat('Is a header needed?'),
      allowMethods: [ 'POST', 'GET', 'OPTIONS' ],
      maxAge: Duration.minutes(10),
      // allowCredentials: true
    });

    this._acknowledgementApiUri = api.urlForPath(`/acknowledge`);
  }

  private createConsentApi = () => {
    const basename = `${this.constructId}Consent`;
    const description = 'for checking invitation code and registering a new user has signed and consented';

    // Create the lambda function
    this.consentLambda = new class extends AbstractFunction { }(this, basename, {
      runtime: Runtime.NODEJS_18_X,
      entry: 'lib/lambda/functions/signup/Consent.ts',
      // handler: 'handler',
      functionName: `Ett${basename}`,
      description: `Function ${description}`,
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(this, 'ConsentApiRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        description: `Grants actions to the consent api lambda function to perform the related api tasks.`,
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
                resources: [ this.parms.userPool.userPoolArn ],
                effect: Effect.ALLOW
              })
            ]
          })
        }
      }),
      environment: {
        REGION: this.context.REGION,
        DYNAMODB_USER_TABLE_NAME: DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME,
        DYNAMODB_INVITATION_TABLE_NAME: DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME,
        DYNAMODB_ENTITY_TABLE_NAME: DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME,
        CLOUDFRONT_DOMAIN: this.parms.cloudfrontDomain,
        USERPOOL_ID: this.parms.userPool.userPoolId
      }
    });

    // Create the rest api
    const api = new LambdaRestApi(this, `${basename}LambdaRestApi`, {
      deployOptions: {
        description: `API ${description}`,
        stageName: this.stageName
      },
      restApiName: `Ett-${basename}-rest-api`,
      handler: this.consentLambda,
      proxy: false
    });

    // Add the root resource path element of "consent"
    const consentPath = api.root.addResource('consent');
    // Add the task path element
    const taskPath = consentPath.addResource('{task}')
    // Add the "invitation-code" parameter as the last path element.
    const invitationCodePath = taskPath.addResource('{invitation-code}');
    invitationCodePath.addMethod('GET');   // GET /consent/task/{invitation-code}
    invitationCodePath.addMethod('POST');
    invitationCodePath.addCorsPreflight({
      allowOrigins: [ `https://${this.parms.cloudfrontDomain}` ],
      // allowHeaders: Cors.DEFAULT_HEADERS.concat('Is a header needed?'),
      allowMethods: [ 'POST', 'GET', 'OPTIONS' ],
      maxAge: Duration.minutes(10),
      // allowCredentials: true
    });

    this._consentApiUri = api.urlForPath('/consent');
  }

  public grantPermissionsTo = (dynamodb:DynamoDbConstruct) => {
    dynamodb.getInvitationsTable().grantReadWriteData(this.acknowledgeLambda);
    dynamodb.getInvitationsTable().grantReadWriteData(this.consentLambda);
    dynamodb.getEntitiesTable().grantReadWriteData(this.consentLambda);
    dynamodb.getUsersTable().grantReadWriteData(this.consentLambda);
  }

  public get acknowledgementApiUri() {
    return this._acknowledgementApiUri;
  }

  public get consentApiUri() {
    return this._consentApiUri;
  }
}
