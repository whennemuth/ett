import { RemovalPolicy } from 'aws-cdk-lib';
import { CachePolicy, CfnDistribution, CfnOriginAccessControl, Distribution, EdgeLambda, LambdaEdgeEventType, experimental } from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Code, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Bucket, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { IContext } from '../contexts/IContext';
import path = require('path');

export interface CloudfrontConstructProps {
  bucket: Bucket,
  olapAlias?: string
};

export class CloudfrontConstruct extends Construct {

  public static EDGE_VIEWER_REQUEST_CODE_FILE:string = 'cdk.out/asset.viewer.request/index.js';

  constructId: string;
  scope: Construct;
  context: IContext;
  distribution: Distribution;

  constructor(scope: Construct, constructId:string, props:CloudfrontConstructProps) {

    super(scope, constructId);

    this.constructId = constructId;
    this.context = scope.node.getContext('stack-parms');
    const { TAGS: { Landscape:landscape }, STACK_ID } = this.context;
    const  defaultBehavior = { 
      origin: new HttpOrigin('dummy-origin.com', { originId: 'dummy-origin' })
    }

    this.distribution = new Distribution(this, 'Distribution', {
      defaultBehavior,
      comment: `${STACK_ID}-${landscape}-distribution`,
      defaultRootObject: 'index.htm',
      logBucket: new Bucket(this, 'DistributionLogsBucket', {
        removalPolicy: RemovalPolicy.DESTROY,    
        autoDeleteObjects: true,
        objectOwnership: ObjectOwnership.OBJECT_WRITER
      }),
    });

    // Create an lambda@edge viewer request function that can rewrite paths to the origin
    const edgeLambdas = [] as EdgeLambda[];
    createEdgeFunctionForViewerRequest(this, this.context, (edgeLambda:any) => {
      edgeLambdas.push(edgeLambda);
    });

    // Create a behavior that targets the s3 bucket as the origin
    this.distribution.addBehavior('*.*', new S3Origin(props.bucket), {
      cachePolicy: CachePolicy.CACHING_DISABLED,
      edgeLambdas
    });

    // Give cloudfront access to the bucket
    const oac = new CfnOriginAccessControl(this, 'StaticSiteAccessControl', {
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
    const cfnDist = this.distribution.node.defaultChild as CfnDistribution;
    cfnDist.addPropertyOverride('DistributionConfig.Origins.1.OriginAccessControlId', oac.attrId);
    cfnDist.addPropertyOverride('DistributionConfig.Origins.1.S3OriginConfig.OriginAccessIdentity', "");

    if(props.olapAlias) {
      cfnDist.addPropertyOverride('DistributionConfig.Origins.1.DomainName', `${props.olapAlias}.s3.${this.context.REGION}.amazonaws.com`);
    }
  }

  public getDistributionId(): string {
    return this.distribution.distributionId;
  }

  public getDistributionDomainName(): string {
    return this.distribution.domainName;
  }
}

/**
 * Create the Lambda@Edge viewer response function.
 * It can be bundled as normal because the stack is in the correct region.
 */
const createSameRegionEdgeFunction = (stack:CloudfrontConstruct, context:IContext):NodejsFunction => {
  const { STACK_ID, TAGS: { Landscape } } = context;
  const ftn = new NodejsFunction(stack, 'edge-function-viewer-response', {
    runtime: Runtime.NODEJS_18_X,
    entry: 'lib/lambda/functions/cloudfront/ViewerRequest.ts',
    functionName: `${STACK_ID}-${Landscape}-bucket-origin-viewer-request-at-edge`,
  });
  return ftn;
};

/**
 * Create the Lambda@Edge origin request function.
 * It must be created in us-east-1, which, since this stack is NOT being
 * created in us-east-1, requires the experimental EdgeFunction and a prebundled code asset.
 * SEE: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-function-restrictions.html
 * 
 * @param scope 
 * @param context 
 * @returns 
 */
const createCrossRegionEdgeFunction = (scope:CloudfrontConstruct, context:IContext):experimental.EdgeFunction => {
  const { STACK_ID, TAGS: { Landscape } } = context;
  const { EDGE_VIEWER_REQUEST_CODE_FILE:outfile } = CloudfrontConstruct;
  const ftn = new experimental.EdgeFunction(scope, 'BucketOriginViewerRequestFunction', {
    runtime: Runtime.NODEJS_18_X,
    handler: 'index.handler',
    code: Code.fromAsset(path.join(__dirname, `../${path.dirname(outfile)}`)),
    functionName: `${STACK_ID}-${Landscape}-bucket-origin-viewer-request-at-edge`
  });
  return ftn;
}

export const createEdgeFunctionForViewerRequest = (scope:CloudfrontConstruct, context:IContext, callback:(lambda:EdgeLambda) => void) => {
  const { REGION } = context;
  let edgeFunction:NodejsFunction|experimental.EdgeFunction;
  if(REGION == 'us-east-1') {
    edgeFunction = createSameRegionEdgeFunction(scope, context);
  }
  else {
    edgeFunction = createCrossRegionEdgeFunction(scope, context);
  }

  callback({
    eventType: LambdaEdgeEventType.VIEWER_REQUEST,
    functionVersion: edgeFunction.currentVersion
  });
}