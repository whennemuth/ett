import { Construct } from 'constructs';
import { IContext } from '../contexts/IContext';
import { RemovalPolicy, CfnOutput, Stack } from 'aws-cdk-lib';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Distribution, OriginAccessIdentity, LambdaEdgeEventType } from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { RestApi, LambdaIntegration, MethodLoggingLevel } from 'aws-cdk-lib/aws-apigateway';
import { AbstractFunction } from './AbstractFunction';

export interface StaticSiteProps { 
  distribution:Distribution, 
  cognitoUserPoolClientId: string,
  cognitoUserPoolProviderUrl: string,
  apiUris:[{
    id:string, 
    value:string
  }]
};

export class StaticSiteConstruct extends Construct {

  constructId: string;
  scope: Construct;
  context: IContext;
  filterFunction: AbstractFunction;
  props: StaticSiteProps;

  constructor(scope: Construct, constructId: string, props:StaticSiteProps) {

    super(scope, constructId);

    this.scope = scope;
    this.constructId = constructId;
    this.context = scope.node.getContext('stack-parms');
    this.props = props;

    this.buildResources();
  }
  
  buildResources(): void {

    const bucket = new Bucket(this, `${this.constructId}-bucket`, {
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const filterFunction = new AbstractFunction(this, `${this.constructId}-lambda-at-edge-function`, {
      functionName: `${this.constructId}-edge-filter-function`,
      runtime: Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: Code.fromAsset('lambda/edge'),
      environment: {
        INDEX_FILE_URI: '/index.htm'
      }
    });

    /**
     * Add an s3 bucket origin to the distribution that requires retrieved html files go through
     * a lambda function filter so as to inject values into placeholder locations in the html file.
     */
    this.props.distribution.addBehavior(
      '*.htm', // Matches any .htm file in any directory, at any depth.
      new S3Origin(bucket, {
        originAccessIdentity: new OriginAccessIdentity(this, `${this.constructId}-distribution-oai`),
      }),
      {
        edgeLambdas: [
          {
            functionVersion: filterFunction.currentVersion,
            eventType: LambdaEdgeEventType.ORIGIN_RESPONSE
          },
        ],
      }
    )

    // Add the environment variables for the lambda filter function.
    filterFunction.addEnvironment('REDIRECT_URI', `${this.props.distribution.domainName}/index.htm`);
    filterFunction.addEnvironment('USER_POOL_REGION', this.context.REGION);
    filterFunction.addEnvironment('CLIENT_ID', this.props.cognitoUserPoolClientId);
    filterFunction.addEnvironment('COGNITO_DOMAIN', this.props.cognitoUserPoolProviderUrl);
    this.props.apiUris.forEach(item => {
      filterFunction.addEnvironment(item.id, item.value);
    });

    bucket.grantRead(filterFunction);

    // Create an API Gateway for the CloudFront distribution to call the Lambda@Edge function
    const api = new RestApi(this, `${this.constructId}-edge-filter-api`, {
      deployOptions: {
        loggingLevel: MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
    });

    const integration = new LambdaIntegration(filterFunction);
    const resource = api.root.addResource('lambda-at-edge');
    const method = resource.addMethod('ANY', integration);


    // Output the CloudFront distribution endpoint
    if( this.scope instanceof Stack) {
      new CfnOutput((<Stack> this.scope), 'CloudFrontURL', {
        value: this.props.distribution.distributionDomainName,
        description: 'The domain name of the Cloudfront Distribution, such as d111111abcdef8.cloudfront.net.'
      });
    };
  }

}