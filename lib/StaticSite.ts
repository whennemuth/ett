import { Construct } from 'constructs';
import { IContext } from '../contexts/IContext';
import { CfnResource, RemovalPolicy } from 'aws-cdk-lib';
import { BlockPublicAccess, Bucket, CfnAccessPoint } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { CfnAccessPoint as Olap, CfnAccessPointPolicy as OlapPolicy} from 'aws-cdk-lib/aws-s3objectlambda';
import { Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { AbstractFunction } from './AbstractFunction';
import * as path from 'path';
import { Effect, PolicyDocument, PolicyStatement, ServicePrincipal, AnyPrincipal } from 'aws-cdk-lib/aws-iam';

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

  static bucketName: string = 'ett-static-site-content';

  /**
   * Get the olap name as a concatenation that anticipate it, not from the construct directly because that will
   * lead to a circular dependency issue with the distribution.
   * @returns 
   */
  static olapName: string = `${StaticSiteConstruct.bucketName}-olap`;
  static accessPointName: string = `${StaticSiteConstruct.bucketName}-ap`;

  constructId: string;
  scope: Construct;
  context: IContext;
  bucket: Bucket;
  ap: CfnAccessPoint;

  constructor(scope: Construct, constructId: string) {

    super(scope, constructId);

    this.scope = scope;
    this.constructId = constructId;
    this.context = scope.node.getContext('stack-parms');
 
    this.buildBucketAndAccessPoint();
  }

  buildBucketAndAccessPoint(): void {

    this.bucket = new Bucket(this, 'Bucket', {
      bucketName: StaticSiteConstruct.bucketName,
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,    
      autoDeleteObjects: true  
    });

    this.ap = new CfnAccessPoint(this, 'BucketAccessPoint', {
      bucket: StaticSiteConstruct.bucketName,
      name: StaticSiteConstruct.accessPointName, 
      policy: new PolicyDocument({
          statements: [ new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [ 's3:*' ],
          principals: [ new ServicePrincipal('cloudfront.amazonaws.com') ],
          resources: [
            `arn:aws:s3:${this.context.REGION}:${this.context.ACCOUNT}:accesspoint/${StaticSiteConstruct.accessPointName}`,
            `arn:aws:s3:${this.context.REGION}:${this.context.ACCOUNT}:accesspoint/${StaticSiteConstruct.accessPointName}/object/*`
          ],
          conditions: {
            'ForAnyValue:StringEquals': {
              'aws:CalledVia': 's3-object-lambda.amazonaws.com'
            }
          }
        })]
      })
    });

    this.ap.addDependency(this.bucket.node.defaultChild as CfnResource);

    this.bucket.addToResourcePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      principals: [ new AnyPrincipal()],
      actions: [ '*' ],
      resources: [
        `arn:aws:s3:::${StaticSiteConstruct.bucketName}`,
        `arn:aws:s3:::${StaticSiteConstruct.bucketName}/*`,
      ],
      conditions: {
        StringEquals: {
          's3:DataAccessPointAccount': this.context.ACCOUNT
        }
      }
    }));

    new BucketDeployment(this, 'BucketContentDeployment', {
      destinationBucket: this.bucket,
      sources: [
        Source.asset(path.resolve(__dirname, `../frontend`))
      ],
    });
  }

  public addOlap(props:StaticSiteProps): void {

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
        CLIENT_ID: props.cognito.userPool.clientId,
        REDIRECT_URI: props.distribution.domainName,
        USER_POOL_REGION: this.context.REGION,
        COGNITO_DOMAIN: props.cognito.userPool.providerUrl,        
      },
    });

    props.apiUris.forEach(item => {
      injectionFunction.addEnvironment(item.id, item.value);
    });

    const olap = new Olap(this, 'BucketOlap', {
      name: StaticSiteConstruct.olapName,
      objectLambdaConfiguration: {
        supportingAccessPoint: this.ap.attrArn,
        cloudWatchMetricsEnabled: false,
        transformationConfigurations: [
          {
            actions: [ 'GetObject' ],
            contentTransformation: {
              AwsLambda: {
                FunctionArn: injectionFunction.functionArn
              }
            }
          }
        ],
        allowedFeatures: [ 'GetObject-Range', 'GetObject-PartNumber', 'HeadObject-Range', 'HeadObject-PartNumber' ]
      }
    });

    const olapPolicy = new OlapPolicy(this, 'BucketOlapPolicy', {
      objectLambdaAccessPoint: olap.ref,
      policyDocument: new PolicyDocument({
        statements: [ new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [ 's3-object-lambda:Get*' ],
          principals: [ new ServicePrincipal('cloudfront.amazonaws.com') ],
          resources: [ 
            `arn:aws:s3-object-lambda:${this.context.REGION}:${this.context.ACCOUNT}:accesspoint/${olap.ref}` 
          ],
          conditions: {
            StringEquals: {
              'aws:SourceArn': `arn:aws:cloudfront::${this.context.ACCOUNT}:distribution/${props.distribution.id}`
            }
          }
        })]
      })
    }); 

    // olapPolicy.addDependency(olap);

  }

  public getBucket(): Bucket {
    return this.bucket;
  }

}