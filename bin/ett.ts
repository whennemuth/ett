#!/usr/bin/env node
import 'source-map-support/register';
import { App, StackProps, CfnOutput } from 'aws-cdk-lib';
import * as context from '../contexts/context.json';
import { CognitoConstruct } from '../lib/Cognito';
import { AbstractStack } from '../lib/AbstractStack';
import { StaticSiteConstruct } from '../lib/StaticSite';
import { Distribution } from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';

const app = new App();
app.node.setContext('stack-parms', context);
const stackName = `${context.STACK_ID}-${context.TAGS.Landscape}`;

const stackProps: StackProps = {
  stackName: stackName,
  description: 'Ethical transparency tool',
  env: {
    account: context.ACCOUNT,
    region: context.REGION
  },
  tags: {
    Service: context.TAGS.Service,
    Function: context.TAGS.Function,
    Landscape: context.TAGS.Landscape
  }
}

// RESUME NEXT: Fix stack creation errors:
// -------------------------------------------
// CREATE_FAILED        | AWS::CloudFront::Distribution          | EttStaticSiteDistribution (EttStaticSiteDistribution2132AA39) Resource handler returned message: "Invalid request provided: AWS::CloudFront::Distribution: The parameter origin name cannot contain a colon. (Service: CloudFront, Status Code: 400, Request ID: 299ac292-289b-4a56-b63e-2cf5bf9501c5)" (RequestToken: 1911c710-9de5-0406-bc2a-715c5e5c6073, HandlerErrorCode: InvalidRequest)
// CREATE_FAILED        | AWS::S3ObjectLambda::AccessPointPolicy | EttStaticSite/BucketAccessPointPolicy (EttStaticSiteBucketAccessPointPolicyA3C2230C) Resource handler returned message: "The specified accesspoint does not exist (Service: S3Control, Status Code: 404, Request ID: W1F35ACFH8MET219, Extended Request ID: VwABZ83j7pJO/HmBwW9DU5GrIk7+heD581WAAJ7dhoelNe9YOWIVQzABk6vSVfA41tpfMkZgfRlytjwOUnRwow==)" (RequestToken: 1c1ac612-6827-a861-2a90-d6e39f6539d7, HandlerErrorCode: NotFound)
//
// RESUME NEXT: Fix stack deletion from failing due to inability to delete bucket because it has an olap.
const stack = new AbstractStack(app, stackName, stackProps);

const distribution = new Distribution(stack, 'EttStaticSiteDistribution', {
  defaultBehavior: { origin: new HttpOrigin('www.dummy-origin.com') },
  defaultRootObject: 'index.htm',
});

const cognito = new CognitoConstruct(stack, 'EttCognito', { distribution: {
  domainName: distribution.domainName
}});

const staticSite = new StaticSiteConstruct(stack, 'EttStaticSite', { 
  distribution: {
    id: distribution.distributionId,
    domainName: distribution.domainName
  },
  cognito: {
    userPool: {
      clientId: cognito.getUserPoolClient().userPoolClientId,
      providerUrl: cognito.getUserPool().userPoolProviderUrl
    }
  },
  apiUris: [{
    id: 'HELLO_WORLD_API_URI',
    value: cognito.getHelloWorldApiUri()
  }]
});

distribution.addBehavior(
  '*.htm', // Matches any .htm file in any directory, at any depth.
  new HttpOrigin(
    `https://${staticSite.getOlapName()}-${context.REGION}.s3-object-lambda.${context.REGION}.amazonaws.com`, 
    { originId: `${staticSite.getOlapName()}-origin` }
  )
)

new CfnOutput(stack, 'CloudFrontURL', {
  value: distribution.distributionDomainName,
  description: 'The domain name of the Cloudfront Distribution, such as d111111abcdef8.cloudfront.net.'
});
new CfnOutput(stack, 'UserPoolProviderUrl', {
  value: cognito.getUserPool().userPoolProviderUrl,
  description: 'User pool provider URL'
});
new CfnOutput(stack, 'HelloWorldApiUri', {
  value: cognito.getHelloWorldApiUri(),
  description: 'Hello world api uri, just for testing access.'
});
