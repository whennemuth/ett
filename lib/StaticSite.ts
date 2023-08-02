import { Construct } from 'constructs';
import { IContext } from '../contexts/IContext';
import { RemovalPolicy } from 'aws-cdk-lib';
import { BlockPublicAccess, Bucket, CfnAccessPoint } from 'aws-cdk-lib/aws-s3';
import { CfnAccessPointPolicy, CfnAccessPoint as Olap, CfnAccessPointPolicy as OlapPolicy} from 'aws-cdk-lib/aws-s3objectlambda';
import { Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { AbstractFunction } from './AbstractFunction';
import * as path from 'path';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

export interface StaticSiteProps {
  distribution: {
    id: string,
    domainName: string
  },
  cognito: {
    userPool: {
      clientId: string,
      providerUrl: string     
    }
  },
  apiUris:[{
    id:string, 
    value:string
  }]
};

export class StaticSiteConstruct extends Construct {

  bucketName: string = 'ett-static-site-content';
  constructId: string;
  scope: Construct;
  context: IContext;
  props: StaticSiteProps;
  olap: Olap;

  constructor(scope: Construct, constructId: string, props:StaticSiteProps) {

    super(scope, constructId);

    this.scope = scope;
    this.constructId = constructId;
    this.context = scope.node.getContext('stack-parms');
    this.props = props;

    this.buildResources();
  }

  buildResources(): void {

    const bucket = new Bucket(this, 'Bucket', {
      bucketName: this.bucketName,
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const injectionFunction = new AbstractFunction(this, 'InjectionFunction', {
      functionName: `${this.constructId}-injection-function`,
      runtime: Runtime.NODEJS_18_X,
      handler: 'Injector.handler',
      code: Code.fromAsset(path.join(__dirname, `lambda`)),
      logRetention: 7,
      cleanup: true,
      initialPolicy: [new PolicyStatement({
        effect: Effect.ALLOW,
        resources: [ '*' ],
        actions: [ 's3-object-lambda:WriteGetObjectResponse' ]
      })],
      environment: {
        CLIENT_ID: this.props.cognito.userPool.clientId,
        REDIRECT_URI: this.props.distribution.domainName,
        USER_POOL_REGION: this.context.REGION,
        COGNITO_DOMAIN: this.props.cognito.userPool.providerUrl,        
      },
    });

    this.props.apiUris.forEach(item => {
      injectionFunction.addEnvironment(item.id, item.value);
    });

    const ap = new CfnAccessPoint(this, 'BucketAccessPoint', {
      bucket: this.bucketName,
      name: `${this.bucketName}-ap`,  
    });

    new CfnAccessPointPolicy(this, 'BucketAccessPointPolicy', {
      objectLambdaAccessPoint: ap.ref,
      policyDocument: {
        Effect: Effect.ALLOW,
        Actions: [ 's3:*' ],
        Principal: {
          Service: 'cloudfront.amazonaws.com'
        },
        Resources: [
          `arn:aws:s3:${this.context.REGION}:${this.context.ACCOUNT}:accesspoint/${ap.ref}`,
          `arn:aws:s3:${this.context.REGION}:${this.context.ACCOUNT}:accesspoint/${ap.ref}/object/*`
        ],
        Conditions: {
          'ForAnyValue:StringEquals': {
            'aws:CalledVia': 's3-object-lambda.amazonaws.com'
          }
        }
      }
    });    

    this.olap = new Olap(this, 'BucketOlap', {
      name: `${this.bucketName}-olap`,
      objectLambdaConfiguration: {
        supportingAccessPoint: ap.attrArn,
        cloudWatchMetricsEnabled: false,
        transformationConfigurations: [
          {
            actions: [ 'GetObject' ],
            contentTransformation: {
              FunctionArn: injectionFunction.functionArn
            },
          }
        ],
        allowedFeatures: [ 'GetObject-Range', 'GetObject-PartNumber', 'HeadObject-Range', 'HeadObject-PartNumber' ]
      }
    });

    new OlapPolicy(this, 'BucketOlapPolicy', {
      objectLambdaAccessPoint: this.olap.ref,
      policyDocument: {
        Effect: Effect.ALLOW,
        Actions: [ 's3-object-lambda:Get*' ],
        Principal: {
          Service: 'cloudfront.amazonaws.com'
        },
        Resources: [ `arn:aws:s3-object-lambda:${this.context.REGION}:${this.context.ACCOUNT}:accesspoint/${this.olap.ref}` ],
        Conditions: {
          StringEquals: {
            'aws:SourceArn': `arn:aws:cloudfront::${this.context.ACCOUNT}:distribution/${this.props.distribution.id}`
          }
        }
      }
    });
  }

  public getOlapName(): string {
    return `${this.bucketName}-olap`;
  }
}