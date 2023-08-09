import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { StaticSiteConstruct } from './StaticSite';
import { AbstractFunction } from './AbstractFunction';
import { Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { S3EventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { EventType } from 'aws-cdk-lib/aws-s3';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import path = require('path');


export interface NameValuePair {
  name: string, value: string
};

export interface StaticSiteCustomInConstructParms {
  bucket: Bucket,
  cognitoClientId: string,
  cognitoDomain: string,
  cognitoRedirectURI: string
  cognitoUserpoolRegion: string,
  distributionId: string,
  apiUris: NameValuePair[]
};

export class StaticSiteCustomInConstruct extends StaticSiteConstruct {

  constructor(scope: Construct, constructId: string, props:StaticSiteCustomInConstructParms) {
    super(scope, constructId, props);
  }

  public customize(): void {
    const inProps = (<StaticSiteCustomInConstructParms>this.props);
    const functionName = `${this.constructId}-injection-function`;
    const conversionFunction = new AbstractFunction(this, 'TextConverterFunction', {
      functionName,
      runtime: Runtime.NODEJS_18_X,
      handler: 'Injector.handler',
      logRetention: 7,
      cleanup: true,
      code: Code.fromAsset(path.join(__dirname, `lambda/injector-event`)),
      environment: {
        COGNITO_DOMAIN: inProps.cognitoDomain,
        CLIENT_ID: inProps.cognitoClientId,
        REDIRECT_URI: inProps.cognitoRedirectURI,
        USER_POOL_REGION: inProps.cognitoUserpoolRegion
      }
    });

    inProps.apiUris.forEach(item => {
      conversionFunction.addEnvironment(item.name, item.value);
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
          'aws:SourceArn': `arn:aws:cloudfront::037860335094:distribution/${inProps.distributionId}`
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