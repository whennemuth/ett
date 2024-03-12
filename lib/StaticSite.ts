import { Construct } from "constructs";
import { IContext } from '../contexts/IContext';
import { RemovalPolicy } from 'aws-cdk-lib';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import * as path from 'path';

/**
 * This is the boilerplate for the static site. It includes bucket creation and the uploading of an index file.
 * Subclasses will add functionality by implementing the customize function.
 */
export abstract class StaticSiteConstruct extends Construct {

  constructId: string;
  scope: Construct;
  context: IContext;
  bucket: Bucket;
  props: any;
  
  constructor(scope: Construct, constructId: string, props:any) {

    super(scope, constructId);

    this.scope = scope;
    this.constructId = constructId;
    this.props = props;
    this.context = scope.node.getContext('stack-parms');
  
    this.customize();
  }

  public abstract customize(): void;
 
  public getBucket(): Bucket {
    if( ! this.bucket) {
      if(this.props?.bucket) {
        this.bucket = this.props.bucket;
      }
      else {
        this.bucket = new Bucket(this, 'Bucket', {
          bucketName: this.context.BUCKET_NAME,
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
   * Set up a bucket deployment to upload the index.htm file to the bucket as part of the overall
   * cdk deployment. If a lambda needs to have been created already that will intercept this file on its
   * way into the bucket so as to modify it's content, a dependency to the corresponding resource(s)
   * needs to be applied to the BucketDeployment.
   */
  public setIndexFileForUpload(dependOn?:Construct[]) {
    const deployment = new BucketDeployment(this, 'BucketContentDeployment', {
      destinationBucket: this.getBucket(),
      sources: [
        Source.asset(path.resolve(__dirname, `../frontend`))
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