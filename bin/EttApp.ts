#!/usr/bin/env node
import 'source-map-support/register';
import * as ctx from '../contexts/context.json';
import { IContext, SCENARIO } from '../contexts/IContext';
import { App, CfnOutput, StackProps } from 'aws-cdk-lib';
import { AbstractStack } from '../lib/AbstractStack';
import { StaticSiteConstruct } from '../lib/StaticSite';
import { CloudfrontConstruct, CloudfrontConstructProps } from '../lib/Cloudfront';
import { CognitoConstruct } from '../lib/Cognito';
import { DynamoDbConstruct } from '../lib/DynamoDb';
import { LambdaFunction } from '../lib/role/ReAdmin';
import { StaticSiteCustomInConstruct, StaticSiteCustomInConstructParms } from '../lib/StaticSiteCustomIn';
import { ApiConstruct, ApiConstructParms } from '../lib/Api';
import { Roles } from '../lib/lambda/_lib/dao/entity';

const context:IContext = <IContext>ctx;

const app = new App();
app.node.setContext('stack-parms', context);
const stackName = `${context.STACK_ID}-${context.TAGS.Landscape}`;

const stackProps: StackProps = {
  stackName,
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
  const cloudfront = new CloudfrontConstruct(stack, 'EttCloudfront', { bucket } as CloudfrontConstructProps);

  // Set up the cognito userpool and userpool client
  const cognito = new CognitoConstruct(stack, 'EttCognito');

  // Set up the dynamodb table for users.
  const dynamodb = new DynamoDbConstruct(stack, 'EttDynamodb');

  // Set up each api
  const api = new ApiConstruct(stack, 'Api', {
    userPool: cognito.getUserPool(),
    userPoolName: cognito.getUserPoolName(),    
    cloudfrontDomain: cloudfront.getDistributionDomainName(),
    redirectPath: 'index.htm'
  } as ApiConstructParms);

  // Grant the apis the necessary permissions (policy actions).
  api.grantPermissions(dynamodb, cognito);

  // Set up the event, lambda and associated policies for modification of html files as they are uploaded to the bucket.
  const staticSite = new StaticSiteCustomInConstruct(stack, 'EttStaticSite', {
    bucket,
    distributionId: cloudfront.getDistributionId(),
    cloudfrontDomain: cloudfront.getDistributionDomainName(),
    cognitoDomain: cognito.getUserPoolDomain(),
    cognitoUserpoolRegion: context.REGION,
    apis: [ 
      api.helloWorldApi.getApi(), 
      api.sysAdminApi.getApi(), 
      api.reAdminApi.getApi(), 
      api.authIndApi.getApi(),
      api.consentingPersonApi.getApi()
    ]
  } as StaticSiteCustomInConstructParms);  

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
  new CfnOutput(stack, `${Roles.HELLO_WORLD}-api-uri`, {
    value: api.helloWorldApi.getApi().getRestApiUrl(),
    description: 'Hello world api uri, just for testing access.'
  });  
  new CfnOutput(stack, `${Roles.SYS_ADMIN}-api-uri`, {
    value: api.sysAdminApi.getApi().getRestApiUrl(),
    description: 'System Administrator api uri'
  }); 
  new CfnOutput(stack, `${Roles.RE_ADMIN}-api-uri`, {
    value: api.reAdminApi.getApi().getRestApiUrl(),
    description: 'Registered entity administrator api uri'
  }); 
  new CfnOutput(stack, `${Roles.RE_AUTH_IND}-api-uri`, {
    value: api.authIndApi.getApi().getRestApiUrl(),
    description: 'Authorized individual api uri'
  });
  new CfnOutput(stack, `${Roles.CONSENTING_PERSON}-api-uri`, {
    value: api.consentingPersonApi.getApi().getRestApiUrl(),
    description: 'Consenting person api uri'
  });
}

const buildDynamoDb = (): DynamoDbConstruct => {
  const db = new DynamoDbConstruct(stack, 'EttDynamodb');
  const lambdaFunction = new LambdaFunction(stack, 'ReAdminUserLambda');
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

