import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { StaticSiteConstruct } from './StaticSite';
import { AbstractFunction } from './AbstractFunction';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { S3EventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { EventType } from 'aws-cdk-lib/aws-s3';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { AbstractRoleApi } from './role/AbstractRole';
import path = require('path');
import { Roles } from './lambda/_lib/dao/entity';


export interface NameValuePair {
  name: string, value: string
};

export interface StaticSiteCustomInConstructParms {
  bucket: Bucket,
  distributionId: string,
  cloudfrontDomain: string,
  cognitoDomain: string,
  cognitoUserpoolRegion: string,
  apis: AbstractRoleApi[]
}

/**
 * The lambda function will receive all environment variable info through one environment
 * variable set with a json object as the value.
 * @param parms 
 * @returns 
 */
const buildJsonEnvVar = (parms: StaticSiteCustomInConstructParms) => {
  let jsonObj = {
    COGNITO_DOMAIN: parms.cognitoDomain,
    USER_POOL_REGION: parms.cognitoUserpoolRegion,
    ROLES: { } as any
  };
  parms.apis.forEach((api:AbstractRoleApi) => {
    jsonObj.ROLES[api.getRole()] = {
      CLIENT_ID: api.getUserPoolClientId(),
      REDIRECT_URI: `${parms.cloudfrontDomain}/index.htm`,
      API_URI: api.getRestApiUrl()
    }
  });
  return JSON.stringify(jsonObj, null, 2);
}

export class StaticSiteCustomInConstruct extends StaticSiteConstruct {

  constructor(scope: Construct, constructId: string, props:StaticSiteCustomInConstructParms) {
    super(scope, constructId, props);
  }

  public customize(): void {
    const inProps = (<StaticSiteCustomInConstructParms>this.props);
    const functionName = `${this.constructId}-injection-function`;
    const staticParms = buildJsonEnvVar(inProps);
    const conversionFunction = new AbstractFunction(this, 'TextConverterFunction', {
      functionName,
      description: 'Function for modifying content being loaded into the static website bucket so that \
        certain placeholders are replaced with resource attribute values, like cognito userpool client attributes.',
      runtime: Runtime.NODEJS_18_X,
      // handler: 'Injector.handler',
      handler: 'handler',
      logRetention: 7,
      cleanup: true,
      entry: path.join(__dirname, `lambda/functions/injector-event/injector.mjs`),
      // code: Code.fromAsset(path.join(__dirname, `lambda/functions/injector-event`)),
      environment: {
        STATIC_PARAMETERS: staticParms
      }
    });

    // Grant the Lambda function permissions to access the S3 bucket
    this.getBucket().grantReadWrite(conversionFunction);

    // Grant cloudfront permission to access the s3 bucket
    this.getBucket().addToResourcePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [ 's3:GetObject' ],
      principals: [ new ServicePrincipal('cloudfront.amazonaws.com') ],
      resources: [
        `arn:aws:s3:::${this.getBucket().bucketName}/*`
      ],
      conditions: {
        StringEquals: {
          'aws:SourceArn': `arn:aws:cloudfront::${this.context.ACCOUNT}:distribution/${inProps.distributionId}`
        }
      }
    }));

    // Create an S3 event notification to trigger the Lambda function on object creation
    const eventSource = new S3EventSource(this.getBucket(), {
      events: [ EventType.OBJECT_CREATED ],
    });

    conversionFunction.addEventSource(eventSource);
  }
}