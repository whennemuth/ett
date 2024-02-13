import { Construct } from "constructs";
import { AbstractFunction } from "./AbstractFunction";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { DynamoDbConstruct } from "./DynamoDb";
import { Cors, LambdaRestApi } from "aws-cdk-lib/aws-apigateway";
import { Duration } from "aws-cdk-lib";
import { IContext } from "../contexts/IContext";

/**
 * Construct for all api gateways and integrated lambda functions for pre-cognito signup activity (
 * privacy policy acknowledgement & consent).
 */
export class SignupApiConstruct extends Construct {

  private outerScope:Construct;
  private constructId:string;
  private cloudfrontDomain:string;
  private stageName:string;
  private _acknowledgementApiUri:string;
  private _consentApiUri:string;
  private acknowledgeLambda:AbstractFunction;
  private consentLambda:AbstractFunction;

  constructor(scope:Construct, constructId:string, cloudfrontDomain:string) {
    super(scope, constructId);

    this.outerScope = scope;
    this.constructId = constructId;
    this.cloudfrontDomain = cloudfrontDomain;
    const context: IContext = scope.node.getContext('stack-parms');
    this.stageName = context.TAGS.Landscape;

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
        REGION: this.outerScope.node.getContext('stack-parms').REGION,
        DYNAMODB_INVITATION_TABLE_NAME: DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME,
        CLOUDFRONT_DOMAIN: this.cloudfrontDomain
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
      allowOrigins: [ `https://${this.cloudfrontDomain}` ],
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
      environment: {
        REGION: this.outerScope.node.getContext('stack-parms').REGION,
        DYNAMODB_INVITATION_TABLE_NAME: DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME,
        CLOUDFRONT_DOMAIN: this.cloudfrontDomain
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

    // Add the root resource path element of "acknowledge"
    const consentPath = api.root.addResource('consent');
    // Add the task path element
    const taskPath = consentPath.addResource('{task}')
    // Add the "invitation-code" parameter as the last path element.
    const invitationCodePath = taskPath.addResource('{invitation_code}');
    invitationCodePath.addMethod('GET');   // GET /consent/task/{invitation-code}
    invitationCodePath.addMethod('POST');
    invitationCodePath.addCorsPreflight({
      allowOrigins: [ `https://${this.cloudfrontDomain}` ],
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
  }

  public get acknowledgementApiUri() {
    return this._acknowledgementApiUri;
  }

  public get consentApiUri() {
    return this._consentApiUri;
  }
}
