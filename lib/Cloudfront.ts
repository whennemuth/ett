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

    if(props.bucket && !props.olapAlias) {
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
    else if(props.bucket && props.olapAlias) {
      // Use object access control (new)

      /**
       * CIRCULAR DEPENDENCY?
       * It seems this approach is not possible in one stack creation since the distribution being created needs the
       * olap alias. Yet, at the same time, the olap itself needs the distribution id in its access policy, as well as 
       * the lambda function needing distribution ID and domainName in its environment. All these values are 
       * automatically generated and can only be reference by getAttr, not statically set as pre-determined values.
       *    1) The cloudfront distribution needs to be created before the olap creation can begin so the olap can get its properties.
       *    2) The olap needs to be created before the distribution creation can begin so the distribution can get the olap properties.
       * This presents a circular dependency issue.
       * The article that talks about how to implement this discusses steps you perform manually in the aws management 
       * console only, and no cloudformation alternative is provide as I suspect it cannot be done (worth confirming?):
       * 
       * https://aws.amazon.com/blogs/aws/new-use-amazon-s3-object-lambda-with-amazon-cloudfront-to-tailor-content-for-end-users/
       * 
       * Workarounds:
       * 
       *    1) Eliminate the olap dependency on the distribution by wildcarding the olap policy to allow access by any
       *       distribution in the account as opposed to this one identified by ID, and removing direct setting of olap
       *       function environment variables that contain distribution attributes have the function instead look them
       *       up in parameter store where they are placed having predictable parameter names (clunky, but unavoidable).
       * 
       *     2) Keep the distribution wildcarding as mentioned in 1), but abandon olap and instead create a lambda 
       *        function trigger that monitors any upload to the bucket and gets the object, replaces text, and reuploads
       *        the object if that object is textual (not an image, etc.).
       */

      this.distribution = new Distribution(this, 'Distribution', {
        defaultBehavior,
        defaultRootObject: 'index.htm',
        additionalBehaviors: {
          '*.htm': {
            origin: new S3Origin(props.bucket)
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
       * The cdk has not caught up with the newer origin access control (oac). You can get there by letting the it
       * produce an oai and tying it to the S3Config, but then you must blank it out (not remove it) and add the oac 
       * with escape hatches:
       */
      const cfnDist = this.distribution.node.defaultChild as CfnDistribution;
      cfnDist.addPropertyOverride('DistributionConfig.Origins.1.OriginAccessControlId', oac.attrId);
      //  cfnDist.addPropertyOverride('DistributionConfig.Origins.1.DomainName', `${props.olapAlias}.s3.REGION.amazonaws.com`);
      cfnDist.addPropertyOverride('DistributionConfig.Origins.1.S3OriginConfig.OriginAccessIdentity', "");
    }
  }

  public getDistributionId(): string {
    return this.distribution.distributionId;
  }

  public getDistributionDomainName(): string {
    return this.distribution.domainName;
  }
}