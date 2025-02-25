import { Duration } from "aws-cdk-lib";
import { LambdaRestApi } from "aws-cdk-lib/aws-apigateway";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { IContext } from "../contexts/IContext";
import { AbstractFunction } from "./AbstractFunction";
import { DynamoDbConstruct } from "./DynamoDb";
import { Configurations } from "./lambda/_lib/config/Config";
import { FormName } from "./lambda/functions/forms/Download";
import { Actions } from "./role/AbstractRole";

export type PublicApiConstructParms = {
  cloudfrontDomain: string,
  dynamodb?:DynamoDbConstruct
};

export class PublicApiConstruct extends Construct {
  private constructId:string;
  private stageName:string;
  private publicFormsDownloadLambda:AbstractFunction;
  private context:IContext;
  private parms:PublicApiConstructParms;
  private api:LambdaRestApi;

  public static FORM_NAME_PATH_PARAM:string = 'form-name';

  constructor(scope:Construct, constructId:string, parms:PublicApiConstructParms) {
    super(scope, constructId);

    this.constructId = constructId;
    this.parms = parms;
    this.context = scope.node.getContext('stack-parms');
    this.stageName = this.context.TAGS.Landscape;

    this.createPublicFormsDownloadApi();
  }

  private createPublicFormsDownloadApi = () => {
    const { constructId, context: { REGION, CONFIG, TAGS: { Landscape:landscape }, STACK_ID }, 
      parms: { cloudfrontDomain, dynamodb }, stageName 
    } = this;
    const basename = `${constructId}PublicFormsDownload`;
    const description = 'for serving public pdf forms to users as a file download';
    const prefix = `${STACK_ID}-${landscape}`;

    // Create the lambda function
    this.publicFormsDownloadLambda = new class extends AbstractFunction { }(this, basename, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
      entry: 'lib/lambda/functions/forms/Download.ts',
      functionName: `${STACK_ID}-${landscape}-public-forms-download-lambda`,
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
        PREFIX: prefix,
        [Configurations.ENV_VAR_NAME]: new Configurations(CONFIG).getJson()
      }
    });

    // Allow the lambda function to read from the config dynamodb table
    if(dynamodb) {
      dynamodb.getConfigTable().grantReadData(this.publicFormsDownloadLambda);
    }

    // Create the rest api
    this.api = new LambdaRestApi(this, `${basename}LambdaRestApi`, {
      deployOptions: {
        throttlingRateLimit: 1,
        throttlingBurstLimit: 5,
        description: `API ${description}`,
        stageName: stageName
      },
      // binaryMediaTypes: [ 'application/pdf' ],
      binaryMediaTypes: [ '*/*' ],
      restApiName: `${STACK_ID}-${landscape}-public-forms-download-api`,
      handler: this.publicFormsDownloadLambda,
      proxy: false
    });

    // Add the root resource path element of public
    const publicPath = this.api.root.addResource(Actions.public);

    // Add the forms path element
    const formsPath = publicPath.addResource('forms');

    // Add the forms path element
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
  }

  public get publicFormsDownloadApiUris():string[] {
    return Object.values<string>(FormName).map((formName) => {
      return this.api.urlForPath(`/${Actions.public}/forms/download/${formName}`);
    });
  }
}