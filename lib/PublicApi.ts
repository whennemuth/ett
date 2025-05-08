import { Duration } from "aws-cdk-lib";
import { LambdaRestApi } from "aws-cdk-lib/aws-apigateway";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { IContext } from "../contexts/IContext";
import { AbstractFunction } from "./AbstractFunction";
import { DynamoDbConstruct } from "./DynamoDb";
import { Configurations } from "./lambda/_lib/config/Config";
import { FormName } from "./lambda/functions/public/FormsDownload";
import { Actions } from "./role/AbstractRole";
import { EntityPublicTask } from "./lambda/functions/public/Entity";

export const PUBLIC_API_ROOT_URL_ENV_VAR = 'PUBLIC_API_ROOT_URL';

export type PublicApiConstructParms = {
  cloudfrontDomain: string,
  dynamodb?:DynamoDbConstruct
};

/**
 * PublicApiConstruct is a CDK construct that creates a public API for serving
 * public forms and entity information.
 */
export class PublicApiConstruct extends Construct {
  private publicLambda:AbstractFunction;
  private publicApi:LambdaRestApi;

  public static FORM_NAME_PATH_PARAM:string = 'form-name';
  public static ENTITY_TASK_PATH_PARAM:string = 'entity-task';

  constructor(scope:Construct, constructId:string, parms:PublicApiConstructParms) {
    super(scope, constructId);

    const context = scope.node.getContext('stack-parms');
    const { REGION, CONFIG, TAGS: { Landscape:landscape }, STACK_ID } = context as IContext;
    const { cloudfrontDomain, dynamodb } = parms;
    const stageName = landscape;
    const prefix = `${STACK_ID}-${landscape}`;

    // Create the lambda function
    this.publicLambda = new class extends AbstractFunction { }(this, `${constructId}Lambda`, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
      entry: 'lib/lambda/functions/public/Lambda.ts',
      functionName: `${prefix}-public-api-lambda`,
      description: 'Function for serving public api requests',
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      environment: {
        REGION,
        CLOUDFRONT_DOMAIN: cloudfrontDomain,
        PREFIX: prefix,
        [Configurations.ENV_VAR_NAME]: new Configurations(CONFIG).getJson()
      }
    });

    // Allow the lambda function to read from the config and entity dynamodb tables
    if(dynamodb) {
      dynamodb.getConfigTable().grantReadData(this.publicLambda);
      dynamodb.getEntitiesTable().grantReadData(this.publicLambda);
    }

    // Create the rest api
    this.publicApi = new LambdaRestApi(this, `${constructId}LambdaRestApi`, {
      deployOptions: {
        throttlingRateLimit: 1,
        throttlingBurstLimit: 5,
        description: 'API for serving public requests',
        stageName: stageName
      },
      // binaryMediaTypes: [ 'application/pdf' ],
      binaryMediaTypes: [ '*/*' ],
      restApiName: `${prefix}-public-forms-download-api`,
      handler: this.publicLambda,
      proxy: false
    });

    // Add the root resource path element of public
    const publicPath = this.publicApi.root.addResource(Actions.public);

    // Add the forms path element
    const formsPath = publicPath.addResource('forms');

    // Add the entity path element
    const entityPath = publicPath.addResource('entity');

    // Add the download path element
    const actionPath = formsPath.addResource('download');

    // Add the form name path element
    const formNamePath = actionPath.addResource(`{${PublicApiConstruct.FORM_NAME_PATH_PARAM}}`);
    formNamePath.addMethod('GET');
    formNamePath.addMethod('POST');
    formNamePath.addCorsPreflight({
      allowOrigins: [ `https://${cloudfrontDomain}` ],
      // allowHeaders: Cors.DEFAULT_HEADERS.concat('Is a header needed?'),
      allowMethods: [ 'POST', 'GET', 'OPTIONS' ],
      maxAge: Duration.minutes(10),
      // allowCredentials: true
    });

    // Add the entity task path element
    const entityTaskPath = entityPath.addResource(`{${PublicApiConstruct.ENTITY_TASK_PATH_PARAM}}`);
    entityTaskPath.addMethod('GET');
    entityTaskPath.addMethod('POST');
    entityTaskPath.addCorsPreflight({
      allowOrigins: [ `https://${cloudfrontDomain}` ],
      // allowHeaders: Cors.DEFAULT_HEADERS.concat('Is a header needed?'),
      allowMethods: [ 'POST', 'GET', 'OPTIONS' ],
      maxAge: Duration.minutes(10),
      // allowCredentials: true
    });
  }

  public get url():string {
    return this.publicApi.url;
  }

  public get publicFormsDownloadApiUris():string[] {
    return Object.values<string>(FormName).map((formName) => {
      return this.publicApi.urlForPath(`/${Actions.public}/forms/download/${formName}`);
    });
  }

  public get publicEntityInfoApiUris():string[] {
    return Object.values<string>(EntityPublicTask).map((taskName) => {
      return this.publicApi.urlForPath(`/${Actions.public}/entity/${taskName}`);
    });
  }

}