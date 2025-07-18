import { RemovalPolicy } from "aws-cdk-lib";
import { Effect, PolicyStatement, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { CfnCondition, CfnResource, Fn } from 'aws-cdk-lib/core';
import { Construct } from "constructs";
import { StaticSiteConstruct, StaticSiteConstructParms } from "./StaticSite";
import path = require("node:path");

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

  /**
   * Perform a bucket deployment of the website images.
   * This is a one-time operation for stack creation that will not be repeated on stack updates because
   * any content added to the bucket later would be removed because bucket deployments operate to replicate
   * the source to the destination, which may require removing files at the target bucket that are not in the
   * source directory or zip file.
   * @param dependOn 
   */
  public setBucketDeployment(dependOn?: Construct[]): void {
    const bucket = this.getBucket();

    const isStackCreation = new CfnCondition(this, 'IsStackCreation', {
      expression: Fn.conditionEquals(Fn.ref('AWS::StackId'), ''),
    });

    const deployment = new BucketDeployment(this, 'WebsiteBucketContentDeployment', {
      destinationBucket: bucket,
      sources: [
        Source.asset(path.resolve(__dirname, `../frontend/bootstrap`)),
        Source.asset(path.resolve(__dirname, `../frontend/images`)),
      ],
    });

    deployment.node.addDependency(bucket);

    if (dependOn) {
      dependOn.forEach(d => {
        deployment.node.addDependency(d);
      });
    }

    // Conditionally create the deployment based on stack creation
    const cfnDeployment = deployment.node.findChild('CustomResource').node.defaultChild as CfnResource;
    cfnDeployment.cfnOptions.condition = isStackCreation;
  }
}