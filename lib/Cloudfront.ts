import { Construct } from 'constructs';
import { IContext } from '../contexts/IContext';
import { Distribution, CfnOriginAccessControl, CfnDistribution, CachePolicy } from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Bucket } from 'aws-cdk-lib/aws-s3';

export interface CloudfrontConstructProps {
  bucket: Bucket,
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

    this.distribution = new Distribution(this, 'Distribution', {
      defaultBehavior,
      defaultRootObject: 'index.htm',
      additionalBehaviors: {
        '*.htm': {
          origin: new S3Origin(props.bucket),
          cachePolicy: CachePolicy.CACHING_DISABLED
        }
      }
    });      

    const oac = new CfnOriginAccessControl(this, 'EttStaticSiteAccessControl', {
      originAccessControlConfig: {
        name: 'ett-static-site',
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
        description: 'This access control ensures cloudfront signs all http requests it makes to s3 buckets or object lambda access points',
      },
    });

    /**
     * The cdk has not caught up with the newer origin access control (oac). You can get there by letting the it
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