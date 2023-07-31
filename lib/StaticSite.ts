import { Construct } from 'constructs';
import { IContext } from '../contexts/IContext';
import { RemovalPolicy, CfnOutput, Stack } from 'aws-cdk-lib';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Distribution, OriginAccessIdentity, LambdaEdgeEventType } from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { RestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';
import { AbstractFunction } from './AbstractFunction';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import * as path from 'path';

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

    const bucket = new Bucket(this, 'Bucket', {
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const lambdaDir = this.context.CLOUDFRONT_DOMAIN ? 'injectFromOriginHeaders' : 'injectFromParameterStore';

    // RESUME NEXT: Figure out how to have this function deleted automatically upon stack delete, even though
    // it will be replicated and will be blocked.
    // SEE: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-edge-delete-replicas.html
    // Do I have to create a ticket? The stack is deleted, but the replicated function remains - no surviving 
    // distribution behavior through which to get cloudfront to delete it for me.
    const injectionFunction = new AbstractFunction(this, 'LamdaAtEdgeFunction', {
      functionName: `${this.constructId}-edge-injection-function`,
      runtime: Runtime.NODEJS_18_X,
      handler: 'Injector.handler',
      code: Code.fromAsset(path.join(__dirname, `lambda/edge/${lambdaDir}`)),
      logRetention: 7,
      cleanup: true
    });

    // RESUME NEXT: Figure out how to put this function call back in without causing circular reference issue.
    // if(lambdaDir == 'injectFromParameterStore') {
    //   this.createParameterStoreItems(injectionFunction);
    // }

    /**
     * Add an s3 bucket origin to the distribution that requires retrieved html files go through
     * a lambda function filter so as to inject values into placeholder locations in the html file.
     */
    this.props.distribution.addBehavior(
      '*.htm', // Matches any .htm file in any directory, at any depth.
      new S3Origin(bucket, {
        originAccessIdentity: new OriginAccessIdentity(this, `${this.constructId}-distribution-oai`), 
        // customHeaders: customHeaders       
      }),
      {
        edgeLambdas: [
          {
            functionVersion: injectionFunction.currentVersion,
            eventType: LambdaEdgeEventType.ORIGIN_RESPONSE
          },
        ],
      }
    )

    bucket.grantRead(injectionFunction);

    // Create an API Gateway for the CloudFront distribution to call the Lambda@Edge function
    const api = new RestApi(this, 'EdgeInjectionApi', {
      deployOptions: {
        stageName: this.context.TAGS.Landscape,
        description: 'Rest API via which cloudfront uses injection lambda function'
      },
    });

    const integration = new LambdaIntegration(injectionFunction);
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

  /**
   * These parameters are being stored for the sole reason of dealing with a circular dependency issue.
   * The way to provide these values to the filter function would have been as environment variables.
   * But lambda@edge functions cannot have environment variables. So, the alternative would be to provide
   * them to function as headers in the event request. This is done by setting the S3Origin of the behavior
   * added to the distribution above. When synthesized, this will yield a cloudformation template that has a 
   * distribution resource with a behavior whose custom headers have a reference to the future generated 
   * client ID of a cognito userpool resource. However, the coginito userpool resource has a reference to 
   * the distribution default domain name. This is a circular reference.
   * So, the edge function will look these values up from the parameter store instead.
   * NOTE: When the distribution domainNames setting can get an entry and a corresponding certificate, 
   * the domain name will be known before stack creation, there won't be a need to use the default auto-assigned
   * domain, and we can go back to using the custom headers approach
   */
  createParameterStoreItems(injectionFunction:AbstractFunction): void {

    new StringParameter(this, 'UserPoolClientIdParameter', {
      parameterName: `/ett/${this.context.TAGS.Landscape}/userpool/CLIENT_ID`,
      stringValue: this.props.cognitoUserPoolClientId,
      description: 'The client ID of the ett cognito userpool'
    }).grantRead(injectionFunction);

    new StringParameter(this, 'UserPoolRedirectUri', {
      parameterName: `/ett/${this.context.TAGS.Landscape}/userpool/REDIRECT_URI`,
      stringValue: `${this.props.distribution.domainName}/index.htm`,
      description: 'The redirect URI used by client scripts and cognito when performing oauth authorization'
    }).grantRead(injectionFunction);

    new StringParameter(this, 'UserPoolRegion', {
      parameterName: `/ett/${this.context.TAGS.Landscape}/userpool/USER_POOL_REGION`,
      stringValue: this.context.REGION,
      description: 'The region of the cognito user pool'
    }).grantRead(injectionFunction);

    new StringParameter(this, 'UserPoolDomain', {
      parameterName: `/ett/${this.context.TAGS.Landscape}/userpool/COGNITO_DOMAIN`,
      stringValue: this.props.cognitoUserPoolProviderUrl,
      description: 'The domain of the cognito user pool'
    }).grantRead(injectionFunction);

    this.props.apiUris.forEach(item => {
      new StringParameter(this, item.id, {
        parameterName: `/ett/${this.context.TAGS.Landscape}/apiUri/${item.id}`,
        stringValue: item.value,
        description: `The uri for the ${item.id} api`
      }).grantRead(injectionFunction);
    });
  }
}