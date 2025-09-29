import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { S3EventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { BlockPublicAccess, Bucket, EventType } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { AbstractFunction } from './AbstractFunction';
import { StaticSiteConstruct, StaticSiteConstructParms } from './StaticSite';
import path = require('path');
import { RemovalPolicy } from 'aws-cdk-lib';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';

export class StaticSiteBootstrapConstruct extends StaticSiteConstruct {

  public static getBasicBucket = (scope: Construct, suffix?:string): Bucket => {
    return new StaticSiteBootstrapConstruct(
      scope, 'StaticSiteBootstrapConstruct', {} as StaticSiteConstructParms
    ).getBucket(suffix);
  }

  constructor(scope: Construct, constructId: string, parms:StaticSiteConstructParms) {
    super(scope, constructId, parms);
  }

  customize(): void {
    const { context: { ACCOUNT, TAGS: { Landscape:landscape }, STACK_ID, REDIRECT_PATH_BOOTSTRAP }, constructId, parms } = this;
    const { buildSiteParmObject } = StaticSiteBootstrapConstruct;
    const functionName = `${STACK_ID}-${landscape}-${constructId.toLowerCase()}-injection-function`;
    const staticParms = JSON.stringify(buildSiteParmObject(parms as StaticSiteConstructParms, REDIRECT_PATH_BOOTSTRAP), null, 2);
    const conversionFunction = new AbstractFunction(this, 'TextConverterFunction', {
      functionName,
      description: 'Function for modifying content being loaded into the static website bucket so that \
        certain placeholders are replaced with resource attribute values, like cognito userpool client attributes.',
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
      // handler: 'Injector.handler',
      handler: 'handler',
      logRetention: 7,
      cleanup: true,
      entry: path.join(__dirname, `lambda/functions/injector-event/Injector.mjs`),
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
          'aws:SourceArn': `arn:aws:cloudfront::${ACCOUNT}:distribution/${parms!.distributionId}`
        }
      }
    }));

    // Create an S3 event notification to trigger the Lambda function on object creation
    const eventSource = new S3EventSource(this.getBucket(), {
      events: [ EventType.OBJECT_CREATED ],
    });

    conversionFunction.addEventSource(eventSource);
  }

  public getBucket(suffix?:string): Bucket {
    const _suffix = suffix ? `-${suffix}` : '';
    const { bucket, parms, context: { TAGS: { Landscape }, STACK_ID }} = this;
    if( ! bucket) {
      if(parms?.bucket) {
        this.bucket = parms.bucket;
      }
      else {
        this.bucket = new Bucket(this, 'Bucket', {
          bucketName: `${STACK_ID}-${Landscape}-static-site-content${_suffix}`,
          publicReadAccess: false,
          blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
          removalPolicy: RemovalPolicy.DESTROY,    
          autoDeleteObjects: true  
        });
      }
    }
    return this.bucket;
  }

  public setBucketDeployment(dependOn?: Construct[]): void {
    const deployment = new BucketDeployment(this, 'BootstrapBucketContentDeployment', {
      destinationBucket: this.getBucket(),      
      sources: [
        Source.asset(path.resolve(__dirname, `../frontend/bootstrap`)),
        Source.asset(path.resolve(__dirname, `../frontend/images`)),
      ],
    });

    if(dependOn) {
      dependOn.forEach(d => {
        deployment.node.addDependency(d);
      })
    }
    deployment.node.addDependency(this.getBucket())
  }
  
}