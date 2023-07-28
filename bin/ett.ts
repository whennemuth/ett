#!/usr/bin/env node
import 'source-map-support/register';
import { App, StackProps } from 'aws-cdk-lib';
import * as context from '../contexts/context.json';
import { CognitoConstruct } from '../lib/Cognito';
import { AbstractStack } from '../lib/AbstractStack';
import { StaticSiteConstruct } from '../lib/StaticSite';

const app = new App();
app.node.setContext('stack-parms', context);
const stackName = `${context.STACK_ID}-${context.LANDSCAPE}`;

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

const cognito = new CognitoConstruct(stack, `${stackName}-cognito`);

const staticSite = new StaticSiteConstruct(stack, `${stackName}-static-site`, {
  userPool: cognito.getUserPool(),
  userPoolClient: cognito.getUserPoolClient()
});

