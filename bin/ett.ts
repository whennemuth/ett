#!/usr/bin/env node
import 'source-map-support/register';
import { App, StackProps, CfnOutput } from 'aws-cdk-lib';
import * as context from '../contexts/context.json';
import { IContext } from '../contexts/IContext';
import { CognitoConstruct } from '../lib/Cognito';
import { AbstractStack } from '../lib/AbstractStack';
import { CloudfrontConstruct } from '../lib/Cloudfront';
import { StaticSiteCustomOutConstruct } from '../lib/StaticSiteCustomOut';
import { StaticSiteCustomInConstruct } from '../lib/StaticSiteCustomIn';
import { StaticSiteConstruct } from '../lib/StaticSite';

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

let staticSite: StaticSiteConstruct;
let cloudfront:CloudfrontConstruct;
let cognito:CognitoConstruct;

if((<IContext>context).BUCKET_OLAP) {
  // Set up the bucket, ap, olap, lambda, and associated polices for modification of html files read from the bucket.
  staticSite = new StaticSiteCustomOutConstruct(stack, 'EttStaticSite');

  // Set up the cloudfront distribution, origins, behaviors, and oac
  cloudfront = new CloudfrontConstruct(stack, 'EttCloudfront', {
    bucket: staticSite.getBucket(),
    olapAlias: (<StaticSiteCustomOutConstruct>staticSite).getOlapAlias()
  });

  // Set up the cognito userpool and userpool client
  cognito = new CognitoConstruct(stack, 'EttCognito', { distribution: {
    domainName: cloudfront.getDistributionDomainName()
  }});

}
else {
  // Set up the bucket only.
  const bucket = new class extends StaticSiteConstruct{
    public customize(): void { console.log('No customization'); }
  }(stack, 'EttStaticSiteBucket', {}).getBucket() ;

  // Set up the cloudfront distribution, origins, behaviors, and oac
  cloudfront = new CloudfrontConstruct(stack, 'EttCloudfront', { bucket });

  // Set up the cognito userpool and userpool client
  cognito = new CognitoConstruct(stack, 'EttCognito', { distribution: {
    domainName: cloudfront.getDistributionDomainName()
  }});

  // Set up the event, lambda and associated policies for modification of html files as they are uploaded to the bucket.
  staticSite = new StaticSiteCustomInConstruct(stack, 'EttStaticSite', {
    bucket,
    cognitoClientId: cognito.userPoolClient.userPoolClientId,
    cognitoDomain: cognito.getUserPool().userPoolProviderUrl,
    cognitoRedirectURI: `${cloudfront.getDistributionDomainName()}/index.htm`,
    cognitoUserpoolRegion: context.REGION,
    distributionId: cloudfront.getDistributionId(),
    apiUris: [ { name: 'HELLO_WORLD_API_URI', value: cognito.getHelloWorldApiUri() } ]
  });

}


staticSite.setIndexFileForUpload([cloudfront, cognito]);

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
