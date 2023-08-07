#!/usr/bin/env node
import 'source-map-support/register';
import { App, StackProps, CfnOutput } from 'aws-cdk-lib';
import * as context from '../contexts/context.json';
import { CognitoConstruct } from '../lib/Cognito';
import { AbstractStack } from '../lib/AbstractStack';
import { StaticSiteConstruct } from '../lib/StaticSite';
import { Distribution } from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { CloudfrontConstruct } from '../lib/Cloudfront';

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

const stack = new AbstractStack(app, stackName, stackProps);

const staticSite = new StaticSiteConstruct(stack, 'EttStaticSite');

const cloudfront = new CloudfrontConstruct(stack, 'EttCloudfront', {
  olapAlias: staticSite.getOlapAlias()
});

const cognito = new CognitoConstruct(stack, 'EttCognito', { distribution: {
  domainName: cloudfront.getDistributionDomainName()
}});

// staticSite.addOlap({
//   distribution: {
//     id: cloudfront.getDistributionId(),
//     domainName: cloudfront.getDistributionDomainName()
//   },
//   cognito: {
//     userPool: {
//       clientId: cognito.getUserPoolClient().userPoolClientId,
//       providerUrl: cognito.getUserPool().userPoolProviderUrl
//     }
//   },
//   apiUris: [{
//     id: 'HELLO_WORLD_API_URI',
//     value: cognito.getHelloWorldApiUri()
//   }]
// });



new CfnOutput(stack, 'CloudFrontURL', {
  value: cloudfront.getDistributionDomainName(),
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
