import { RemovalPolicy } from "aws-cdk-lib";
import { Effect, PolicyStatement, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";
import { StaticSiteConstruct, StaticSiteConstructParms } from "./StaticSite";

/**
 * This construct is for an s3 bucket that is to host the single page app html file and related
 * artifacts. This bucket will be empty when the stack is deployed, and it is intended that an 
 * independent author will drop their app into this bucket.
 */
export class StaticSiteWebsiteConstruct extends StaticSiteConstruct {

  public static getBasicBucket = (scope: Construct, suffix?:string): Bucket => {
    return new StaticSiteWebsiteConstruct(
      scope, 'StaticSiteWebsiteConstruct', {} as StaticSiteConstructParms
    ).getBucket(suffix);
  }

  constructor(scope: Construct, constructId: string, parms:StaticSiteConstructParms) {
    super(scope, constructId, parms);
  }

  customize(): void {
    const { parms, context: { ACCOUNT } } = this;

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
    const { parms, context: { REDIRECT_PATH_WEBSITE } } = this;
    const { buildSiteParmObject } = StaticSiteWebsiteConstruct;
    const deployment = new BucketDeployment(this, 'WebsiteBucketContentDeployment', {
      destinationBucket: this.getBucket(),      
      sources: [
        Source.jsonData('SiteParameters.json', buildSiteParmObject(parms, REDIRECT_PATH_WEBSITE))
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