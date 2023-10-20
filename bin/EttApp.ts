#!/usr/bin/env node
import 'source-map-support/register';
import * as ctx from '../contexts/context.json';
import { IContext, SCENARIO } from '../contexts/IContext';
import { App, CfnOutput, StackProps } from 'aws-cdk-lib';
import { AbstractStack } from '../lib/AbstractStack';
import { StaticSiteConstruct } from '../lib/StaticSite';
import { CloudfrontConstruct } from '../lib/Cloudfront';
import { CognitoConstruct } from '../lib/Cognito';
import { DynamoDbConstruct } from '../lib/DynamoDb';
import { HelloWorldApi } from '../lib/role/HelloWorld';
import { ReAdminUserApi } from '../lib/role/ReAdmin';
import { StaticSiteCustomInConstruct } from '../lib/StaticSiteCustomIn';
import { AbstractFunction } from '../lib/AbstractFunction';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import path = require('path');

const context:IContext = <IContext>ctx;

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

const stack:AbstractStack = new AbstractStack(app, stackName, stackProps);

const buildAll = () => {
  // Set up the bucket only.
  const bucket = new class extends StaticSiteConstruct{
    public customize(): void { console.log('No customization'); }
  }(stack, 'EttStaticSiteBucket', {}).getBucket() ;

  // Set up the cloudfront distribution, origins, behaviors, and oac
  const cloudfront = new CloudfrontConstruct(stack, 'EttCloudfront', { bucket });

  // Set up the cognito userpool and userpool client
  const cognito = new CognitoConstruct(stack, 'EttCognito', { distribution: {
    domainName: cloudfront.getDistributionDomainName()
  }});

  // Set up the dynamodb table for users.
  const dynamodb = buildDynamoDb();

  // Set up the api gateway resources.
  const apiParms = {
    userPool: cognito.getUserPool(),
    cloudfrontDomain: cloudfront.getDistributionDomainName()
  }

  // Set up the hello world api
  const helloWorldApi = new HelloWorldApi(stack, 'HelloWorld', apiParms);

  // Set up the api for registered entity administrators.
  const reAdminApi = new ReAdminUserApi(stack, 'ReAdminUser', apiParms);

  // Grant the reAdmin lambda function the ability to read and write from the dynamodb users table.
  dynamodb.getUsersTable().grantReadWriteData(reAdminApi.getLambdaFunction());

  // Grant the reAdmin lambda function the ability to read from the dynamodb users table
  cognito.getUserPool().grant(reAdminApi.getLambdaFunction(), 
    'cognito-identity:Describe*', 
    'cognito-identity:Get*', 
    'cognito-identity:List*'
  );

  // Set up the event, lambda and associated policies for modification of html files as they are uploaded to the bucket.
  const staticSite = new StaticSiteCustomInConstruct(stack, 'EttStaticSite', {
    bucket,
    cognitoClientId: helloWorldApi.getUserPoolClientId(),
    cognitoDomain: cognito.getUserPoolDomain(),
    cognitoRedirectURI: `${cloudfront.getDistributionDomainName()}/index.htm`,
    cognitoUserpoolRegion: context.REGION,
    distributionId: cloudfront.getDistributionId(),
    apiUris: [ { name: 'HELLO_WORLD_API_URI', value: helloWorldApi.getRestApiUrl() } ]
  });  

  // Ensure that static html content is uploaded to the bucket that was created.
  staticSite.setIndexFileForUpload([ cloudfront, cognito ]);

  // Set the cloudformation outputs.
  new CfnOutput(stack, 'CloudFrontURL', {
    value: `https://${cloudfront.getDistributionDomainName()}`,
    description: 'The domain name of the Cloudfront Distribution, such as d111111abcdef8.cloudfront.net.'
  });
  new CfnOutput(stack, 'UserPoolProviderUrl', {
    value: cognito.getUserPool().userPoolProviderUrl,
    description: 'User pool provider URL'
  });    
  new CfnOutput(stack, 'HelloWorldApiUri', {
    value: helloWorldApi.getRestApiUrl(),
    description: 'Hello world api uri, just for testing access.'
  });  
}

const buildDynamoDb = (): DynamoDbConstruct => {
  const db = new DynamoDbConstruct(stack, 'EttDynamodb', { });

  // const lambdaFunction = new ReAdminUserLambda(stack, 'ReAdminUserLambda').getLambdaFunction();

  const lambdaFunction = new AbstractFunction(stack, 'ReAdminUserLambda', {
    runtime: Runtime.NODEJS_18_X,
    entry: 'lib/lambda/functions/re-admin/ReAdminUser.ts',
    // handler: 'handler',
    functionName: 'ReAdminUserLambda',
    description: 'Function for all re admin user activity.',
    cleanup: true,
    bundling: {
      externalModules: [
        '@aws-sdk/*',
      ]
    },
    environment: {
      REGION: context.REGION,
      DYNAMODB_USER_TABLE_NAME: DynamoDbConstruct.DYNAMODB_TABLES_USERS_TABLE_NAME
    }
  });

  db.getUsersTable().grantReadWriteData(lambdaFunction);

  return db;
}

switch(context.SCENARIO) {
  case SCENARIO.DEFAULT:
    buildAll();
    break;
  case SCENARIO.DYNAMODB:
    buildDynamoDb();
    break;
}

