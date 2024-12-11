import { RemovalPolicy } from 'aws-cdk-lib';
import { CachePolicy, CfnDistribution, CfnOriginAccessControl, Distribution, LambdaEdgeEventType, experimental } from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Bucket, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { IContext } from '../contexts/IContext';
import path = require('path');
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

export interface CloudfrontConstructProps {
  bootstrapBucket: Bucket,
  websiteBucket: Bucket,
  olapAlias?: string
};

export class CloudfrontConstruct extends Construct {

  public static EDGE_VIEWER_REQUEST_CODE_FILE:string = 'cdk.out/asset.viewer.request/index.js';

  constructId: string;
  scope: Construct;
  context: IContext;
  distribution: Distribution;
  props:CloudfrontConstructProps
  edgeLambdas: any[] = [];

  constructor(scope: Construct, constructId:string, props:CloudfrontConstructProps) {

    super(scope, constructId);

    this.constructId = constructId;
    this.context = scope.node.getContext('stack-parms');
    this.scope = scope;
    this.props = props;
    const { context: { TAGS: { Landscape:landscape }, STACK_ID, REDIRECT_PATH_WEBSITE } } = this;
    const  defaultBehavior = { 
      origin: new HttpOrigin('dummy-origin.com', { originId: 'dummy-origin' })
    }

    this.distribution = new Distribution(this, 'Distribution', {
      defaultBehavior,
      comment: `${STACK_ID}-${landscape}-distribution`,
      defaultRootObject: REDIRECT_PATH_WEBSITE,
      logBucket: new Bucket(this, 'DistributionLogsBucket', {
        removalPolicy: RemovalPolicy.DESTROY,    
        autoDeleteObjects: true,
        objectOwnership: ObjectOwnership.OBJECT_WRITER
      }),
    });

    const behaviors = new CloudfrontBehaviors(this);

    behaviors.addBootstrapBehavior();
  
    behaviors.addWebsiteBehavior();
    
    // REDIRECT_PATH_WEBSITE corresponds to a react artifact that simulates its own reverse proxy
    // Therefore, all paths must "point" to this same artifact at the origin.
    const cfnDist = this.distribution.node.defaultChild as CfnDistribution;
    cfnDist.addPropertyOverride('DistributionConfig.CustomErrorResponses', [ {
      ErrorCode: 403,
      ResponseCode: 200,
      ResponsePagePath: `/${REDIRECT_PATH_WEBSITE}`,
    }]);
  }

  public getDistributionId(): string {
    return this.distribution.distributionId;
  }

  public getDistributionDomainName(): string {
    return this.distribution.domainName;
  }
}


export class CloudfrontBehaviors {

  private cloudfront:CloudfrontConstruct;
  private edgeLambdas: any[] = [];

  constructor(cloudfront:CloudfrontConstruct) {
    this.cloudfront = cloudfront;
  }

  public addBootstrapBehavior(): void {
    const { context, distribution, props, scope } = this.cloudfront;
    const { edgeLambdas, createEdgeFunctionForViewerRequest } = this;
    const { TAGS: { Landscape:landscape }, STACK_ID, REGION } = context;

    // Create an lambda@edge viewer request function for the bootstrap origin that can rewrite paths to that origin
    if(edgeLambdas.length == 0) {
      createEdgeFunctionForViewerRequest();
    }

    // Create a behavior that targets the bootstrap bucket as the origin
    distribution.addBehavior('/bootstrap/*', new S3Origin(props.bootstrapBucket), {
      cachePolicy: CachePolicy.CACHING_DISABLED,
      edgeLambdas
    });

    // Give cloudfront access to the bootstrap bucket
    const oacBootstrap = new CfnOriginAccessControl(scope, 'StaticSiteAccessControlForBootstrap', {
      originAccessControlConfig: {
        name: `${STACK_ID}-${landscape}-static-site-for-bootstap`,
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
        description: 'This access control ensures cloudfront signs all http requests it makes to s3 buckets or object lambda access points',
      },
    });

    /**
     * The cdk has not caught up with the newer origin access control (oac). You can get there by letting it
     * produce an oai and tying it to the S3Config, but then you must blank it out (not remove it) and add the oac 
     * with escape hatches:
     */
    const cfnDist = distribution.node.defaultChild as CfnDistribution;
    cfnDist.addPropertyOverride('DistributionConfig.Origins.1.OriginAccessControlId', oacBootstrap.attrId);
    cfnDist.addPropertyOverride('DistributionConfig.Origins.1.S3OriginConfig.OriginAccessIdentity', "");

    if(props.olapAlias) {
      cfnDist.addPropertyOverride('DistributionConfig.Origins.1.DomainName', `${props.olapAlias}.s3.${REGION}.amazonaws.com`);
    }
  }

  public addWebsiteBehavior(): void {
    const { context, distribution, props, scope } = this.cloudfront;
    const { edgeLambdas, createEdgeFunctionForViewerRequest } = this;
    const { TAGS: { Landscape:landscape }, STACK_ID, REGION } = context;

    // Create an lambda@edge viewer request function for the bootstrap origin that can rewrite paths to that origin
    if(edgeLambdas.length == 0) {
      createEdgeFunctionForViewerRequest();
    }

    // Create a behavior that targets the official content bucket as the origin
    distribution.addBehavior('/*', new S3Origin(props.websiteBucket), {
      cachePolicy: CachePolicy.CACHING_DISABLED,
      edgeLambdas
    });
    
    // Give cloudfront access to the official content bucket
    const oac = new CfnOriginAccessControl(scope, 'StaticSiteAccessControl', {
      originAccessControlConfig: {
        name: `${STACK_ID}-${landscape}-static-site`,
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
        description: 'This access control ensures cloudfront signs all http requests it makes to s3 buckets or object lambda access points',
      },
    });

    /**
     * The cdk has not caught up with the newer origin access control (oac). You can get there by letting it
     * produce an oai and tying it to the S3Config, but then you must blank it out (not remove it) and add the oac 
     * with escape hatches:
     */
    const cfnDist = distribution.node.defaultChild as CfnDistribution;
    cfnDist.addPropertyOverride('DistributionConfig.Origins.2.OriginAccessControlId', oac.attrId);
    cfnDist.addPropertyOverride('DistributionConfig.Origins.2.S3OriginConfig.OriginAccessIdentity', "");

    if(props.olapAlias) {
      cfnDist.addPropertyOverride('DistributionConfig.Origins.2.DomainName', `${props.olapAlias}.s3.${REGION}.amazonaws.com`);
    }

  }

  private createEdgeFunctionForViewerRequest = () => {
    const { context: { STACK_ID, ACCOUNT, TAGS: { Landscape }, REGION }, scope } = this.cloudfront;
    let edgeFunction:Function|experimental.EdgeFunction;
    if(REGION == 'us-east-1') {
      /**
       * Create the Lambda@Edge viewer response function.
       * It can be bundled as normal because the stack is in the correct region.
       */
      edgeFunction = new NodejsFunction(this.cloudfront, 'edge-function-viewer-response', {
        runtime: Runtime.NODEJS_18_X,
        entry: 'lib/lambda/functions/cloudfront/ViewerRequest.ts',
        functionName: `${STACK_ID}-${Landscape}-bucket-origin-viewer-request-at-edge`,
      });    
    }
    else {
      /**
       * Create the Lambda@Edge origin request function.
       * It must be created in us-east-1, which, since this stack is NOT being
       * created in us-east-1, requires the experimental EdgeFunction and a prebundled code asset.
       * SEE: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-function-restrictions.html
       */
      const { EDGE_VIEWER_REQUEST_CODE_FILE:outfile } = CloudfrontConstruct;
      edgeFunction = new experimental.EdgeFunction(scope, 'BucketOriginViewerRequestFunction', {
        runtime: Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: Code.fromAsset(path.join(__dirname, `../${path.dirname(outfile)}`)),
        functionName: `${STACK_ID}-${Landscape}-bucket-origin-viewer-request-at-edge`
      });
    }

    edgeFunction.addToRolePolicy(new PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${REGION}:${ACCOUNT}:parameter/ett/${Landscape}/*`
      ],
    }));

    this.edgeLambdas.push({
      eventType: LambdaEdgeEventType.VIEWER_REQUEST,
      functionVersion: edgeFunction.currentVersion
    })
  }
}



