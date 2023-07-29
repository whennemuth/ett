#!/usr/bin/env node
import 'source-map-support/register';
import { App, StackProps } from 'aws-cdk-lib';
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

const stack = new AbstractStack(app, stackName, stackProps);

const distribution = new Distribution(stack, `${stackName}-static-site-distribution`, {
  defaultBehavior: { origin: new HttpOrigin('http://dummy/origin') },
  defaultRootObject: 'index.htm',
});

const cognito = new CognitoConstruct(stack, `${stackName}-cognito`, { distribution: {
  domainName: distribution.domainName
}});

const staticSite = new StaticSiteConstruct(stack, `${stackName}-static-site`, { 
  distribution,
  cognitoUserPoolClientId: cognito.getUserPoolClient().userPoolClientId,
  cognitoUserPoolProviderUrl: cognito.getUserPool().userPoolProviderUrl,
  apiUris: [{
    id: 'HELLO_WORLD_API_URI',
    value: cognito.getHelloWorldApiUri()
  }]
});


