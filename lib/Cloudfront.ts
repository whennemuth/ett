import { Construct } from 'constructs';
import { IContext } from '../contexts/IContext';
import { Distribution, CfnOriginAccessControl, CfnDistribution } from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Bucket } from 'aws-cdk-lib/aws-s3';

export interface CloudfrontConstructProps {
  bucket?: Bucket,
  olapAlias?: string
};

export class CloudfrontConstruct extends Construct {

  constructId: string;
  scope: Construct;
  context: IContext;
  distribution: Distribution;

  constructor(scope: Construct, constructId:string, props:CloudfrontConstructProps) {

    super(scope, constructId);

    this.constructId = constructId;
    this.context = scope.node.getContext('stack-parms');
    const  defaultBehavior = { 
      origin: new HttpOrigin('dummy-origin.com', { originId: 'dummy-origin' })
    }

    if(props.bucket && props.olapAlias) {
      throw new Error('Illegal parameters [CloudfrontConstructProps]: bucket and olapAlias are mutually exclusive.');
    }
    else if(props.bucket) {
      // Use object access identity (legacy)
      this.distribution = new Distribution(this, 'Distribution', {
        defaultBehavior,
        defaultRootObject: 'index.htm',
        additionalBehaviors: {
          '*.htm': {
            origin: new S3Origin(props.bucket)
          }
        }
      });      
    }
    else {
      // Use object access control (new)

      /**
       * CIRCULAR DEPENDENCY?
       * It seems this approach is not possible in one stack creation since the distribution being created needs the
       * olap alias. Yet, at the same time, the olap itself needs the distribution id in its access policy. This 
       * presents a circular dependency issue.
       * The article that talks about how to implement this discusses steps you perform manually in the aws management 
       * console only, and no cloudformation alternative is provide as I suspect it cannot be done (worth confirming?):
       * 
       * https://aws.amazon.com/blogs/aws/new-use-amazon-s3-object-lambda-with-amazon-cloudfront-to-tailor-content-for-end-users/
       */

      this.distribution = new Distribution(this, 'Distribution', {
        defaultBehavior,
        defaultRootObject: 'index.htm',
        additionalBehaviors: {
          '*.htm': {
            origin: new HttpOrigin(`${props.olapAlias}.s3.REGION.amazonaws.com`)
          }
        }
      });

      const oac = new CfnOriginAccessControl(this, 'EttStaticSiteAccessControl', {
        originAccessControlConfig: {
          name: 'ett-static-site',
          originAccessControlOriginType: 's3',
          signingBehavior: 'always',
          signingProtocol: 'sigv4',
          description: 'This access control ensures cloudfront signs all http requests it makes to s3 object lambda access points',
        },
      });

      /**
       * The cdk has not caught up with the newer origin access control (oac). You can get part way there by defining
       * an HttpOrigin (above)and then employ this escape hatch that adds a reference to the oac in that origin.
       */
     const cfnDist = this.distribution.node.defaultChild as CfnDistribution;
     cfnDist.addPropertyOverride('DistributionConfig.Origins.1.OriginAccessControlId', oac.attrId);
    }
  }

  public getDistributionId(): string {
    return this.distribution.distributionId;
  }

  public getDistributionDomainName(): string {
    return this.distribution.domainName;
  }
}