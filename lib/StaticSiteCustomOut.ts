import { Construct } from "constructs";
import { CfnResource } from 'aws-cdk-lib';
import { StaticSiteConstruct } from "./StaticSite";
import { CfnAccessPoint } from 'aws-cdk-lib/aws-s3';
import { CfnAccessPoint as Olap, CfnAccessPointPolicy as OlapPolicy} from 'aws-cdk-lib/aws-s3objectlambda';
import { Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { AbstractFunction } from './AbstractFunction';
import { Effect, PolicyDocument, PolicyStatement, ServicePrincipal, AnyPrincipal } from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

/**
 * This class creates all the resources around a bucket so that requests for html files go through an object
 * lambda access point to have the content modifed on its way out back to the requester. This includes the 
 * olap itself, its lambda function, and the supporting access point.
 * Can be adapted to perform dynamic image resizing.
 * 
 * CIRCULAR DEPENDENCY WARNING
 * It seems this approach is problematic in one stack creation since the distribution being created needs the
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
 *     2) Use StaticSiteCustomIn.js instead.
 * 
 */
export class StaticSiteCustomOutConstruct extends StaticSiteConstruct {

  olap: Olap;

  constructor(scope: Construct, constructId: string, props?:any) {
    super(scope, constructId, props);
  }

  public customize(): void {

    const bucketName: string = this.context.BUCKET_NAME;
    const olapName: string = `${bucketName}-olap`;
    const accessPointName: string = `${bucketName}-ap`;

    const ap = new CfnAccessPoint(this, 'BucketAccessPoint', {
      bucket: bucketName,
      name: accessPointName, 
      policy: new PolicyDocument({
          statements: [ new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [ 's3:*' ],
          principals: [ new ServicePrincipal('cloudfront.amazonaws.com') ],
          resources: [
            `arn:aws:s3:${this.context.REGION}:${this.context.ACCOUNT}:accesspoint/${accessPointName}`,
            `arn:aws:s3:${this.context.REGION}:${this.context.ACCOUNT}:accesspoint/${accessPointName}/object/*`
          ],
          conditions: {
            'ForAnyValue:StringEquals': {
              'aws:CalledVia': 's3-object-lambda.amazonaws.com'
            }
          }
        })]
      })
    });

    ap.addDependency(this.getBucket().node.defaultChild as CfnResource);

    this.getBucket().addToResourcePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      principals: [ new AnyPrincipal()],
      actions: [ '*' ],
      resources: [
        `arn:aws:s3:::${bucketName}`,
        `arn:aws:s3:::${bucketName}/*`,
      ],
      conditions: {
        StringEquals: {
          's3:DataAccessPointAccount': this.context.ACCOUNT
        }
      }
    }));

    const functionName = `${this.constructId}-injection-function`;
    const injectionFunction = new AbstractFunction(this, 'InjectionFunction', {
      functionName,
      runtime: Runtime.NODEJS_18_X,
      handler: 'Injector.handler',
      code: Code.fromAsset(path.join(__dirname, `lambda/injector-olap`)),
      logRetention: 7,
      cleanup: true,
      initialPolicy: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: [ '*' ],
          actions: [ 's3-object-lambda:WriteGetObjectResponse' ]
        })
      ],
      environment: {
        USER_POOL_REGION: this.context.REGION,
        // ****** Circular dependency 1 ******
        // CLIENT_ID: props.cognito.userPool.clientId,
        // REDIRECT_URI: props.distribution.domainName,
        // COGNITO_DOMAIN: props.cognito.userPool.providerUrl,        
      },
    });

    injectionFunction.grantInvoke(new ServicePrincipal('cloudfront.amazonaws.com'));

    // ****** Circular dependency 2 ******
    // props.apiUris.forEach(item => {
    //   injectionFunction.addEnvironment(item.id, item.value);
    // });

    this.olap = new Olap(this, 'BucketOlap', {
      name: olapName,
      objectLambdaConfiguration: {
        supportingAccessPoint: ap.attrArn,
        cloudWatchMetricsEnabled: false,
        transformationConfigurations: [
          {
            actions: [ 'GetObject' ],
            contentTransformation: {
              AwsLambda: {
                FunctionArn: injectionFunction.functionArn
              }
            }
          }
        ],
        allowedFeatures: [ 'GetObject-Range', 'GetObject-PartNumber', 'HeadObject-Range', 'HeadObject-PartNumber' ]
      }
    });

    const olapPolicy = new OlapPolicy(this, 'BucketOlapPolicy', {
      objectLambdaAccessPoint: this.olap.ref,
      policyDocument: new PolicyDocument({
        statements: [ new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [ 's3-object-lambda:Get*' ],
          principals: [ new ServicePrincipal('cloudfront.amazonaws.com') ],
          resources: [ 
            `arn:aws:s3-object-lambda:${this.context.REGION}:${this.context.ACCOUNT}:accesspoint/${this.olap.ref}` 
          ],
          conditions: {
            // ****** Circular dependency 3 ******
            // StringEquals: {
            //   'aws:SourceArn': `arn:aws:cloudfront::${this.context.ACCOUNT}:distribution/${distribution.id}`
            // }

            // Means any distribution in the account can access the olap, but there will probably be only
            // one distribution in the account anyway.
            StringLike: {
              'aws:SourceArn': `arn:aws:cloudfront::${this.context.ACCOUNT}:distribution/*`
            }
          }
        })]
      })
    }); 
  }
  
  public getOlapAlias(): string {
    return this.olap.attrAliasValue;
  }
}