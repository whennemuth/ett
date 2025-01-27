#!/usr/bin/env node
import { App, CfnOutput, RemovalPolicy, StackProps, Tags } from 'aws-cdk-lib';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { BuildOptions, build } from 'esbuild';
import 'source-map-support/register';
import { IContext, SCENARIO } from '../contexts/IContext';
import * as ctx from '../contexts/context.json';
import { AbstractStack } from '../lib/AbstractStack';
import { ApiConstruct, ApiConstructParms } from '../lib/Api';
import { CloudfrontConstruct, CloudfrontConstructProps } from '../lib/Cloudfront';
import { CognitoConstruct, CognitoConstructParms } from '../lib/Cognito';
import { DelayedExecutionLambdaParms, DelayedExecutionLambdas, DelayedExecutions } from '../lib/DelayedExecution';
import { DynamoDbConstruct } from '../lib/DynamoDb';
import { SignupApiConstruct, SignupApiConstructParms } from '../lib/SignupApi';
import { StaticSiteConstructParms } from '../lib/StaticSite';
import { StaticSiteBootstrapConstruct } from '../lib/StaticSiteBootstrap';
import { StaticSiteWebsiteConstruct } from '../lib/StaticSiteWebsite';
import { Roles } from '../lib/lambda/_lib/dao/entity';
import { ViewerRequestParametersConstruct } from '../lib/lambda/functions/cloudfront/ViewerRequestParameters';

const context:IContext = <IContext>ctx;
export const StackDescription = 'Ethical transparency tool';

const app = new App();
app.node.setContext('stack-parms', context);
const { 
  STACK_ID, ACCOUNT:account, REGION:region, TAGS: { Function, Landscape, Service }, SCENARIO:scenario, REDIRECT_PATH_WEBSITE
} = context;
const stackName = `${STACK_ID}-${Landscape}`;

const stackProps: StackProps = {
  stackName,
  description: StackDescription,
  env: { account, region },
  tags: { Service, Function, Landscape }
};

/**
 * Gotta build the lambda code asset manually due to using EdgeLambda instead of NodejsFunction
 * if the region is not us-east-1
 * @param context 
 */
if( region != 'us-east-1' ) {
  const { EDGE_VIEWER_REQUEST_CODE_FILE:outfile } = CloudfrontConstruct;

  (async () => {
    await build({
      entryPoints: ['lib/lambda/functions/cloudfront/ViewerRequest.ts'],
      write: true,
      outfile,
      bundle: true,
      platform: 'node',
      external: ['@aws-sdk/*']
    } as BuildOptions);
  })();
};


const stack:AbstractStack = new AbstractStack(app, stackName, stackProps);

// Adding tags into the stackProps does not seem to work - have to apply tags using aspects:
Tags.of(stack).add('Service', Service);
Tags.of(stack).add('Function', Function);
Tags.of(stack).add('Landscape', Landscape);

const buildAll = () => {
  // Set up the static site buckets only.
  const bootstrapBucket = StaticSiteBootstrapConstruct.getBasicBucket(stack, 'bootstrap'); 
  const websiteBucket = StaticSiteWebsiteConstruct.getBasicBucket(stack); 

  // Create a bucket for exhibit forms
  const exhibitFormsBucket = new Bucket(stack, 'ExhibitFormsBucket', {
    bucketName: `${STACK_ID}-${Landscape}-exhibit-forms`,
    publicReadAccess: false,
    blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    removalPolicy: RemovalPolicy.DESTROY,    
    autoDeleteObjects: true  
  });

  // Set up the cloudfront distribution, origins, behaviors, and oac
  const cloudfront = new CloudfrontConstruct(stack, 'Cloudfront', { bootstrapBucket, websiteBucket } as CloudfrontConstructProps);

  // Set up the cognito userpool and userpool client
  const cognito = new CognitoConstruct({
    scope:stack, 
    constructId:'Cognito',
    exhibitFormsBucket: exhibitFormsBucket,
    handleStaleEntityVacancyLambdaArn: `arn:aws:lambda:${region}:${account}:function:${stackName}-${DelayedExecutions.HandleStaleEntityVacancy.coreName}`
  } as CognitoConstructParms);

  // Set up the dynamodb table for users.
  const dynamodb = new DynamoDbConstruct(stack, 'Dynamodb');

  // Set up the public api register endpoints for "pre-signup" that are called before any cognito signup occurs.
  const signupApi = new SignupApiConstruct(stack, 'SignupApi', {
    cloudfrontDomain: cloudfront.getDistributionDomainName(),
    userPool:cognito.getUserPool()
  } as SignupApiConstructParms);

  // Create all the delayed execution lambda functions
  const delayedExecutionLambdas = new DelayedExecutionLambdas(stack, 'DelayedExecution', {
    cloudfrontDomain: cloudfront.getDistributionDomainName(),
    exhibitFormsBucket,
    userPoolId:cognito.getUserPool().userPoolId
  } as DelayedExecutionLambdaParms);

  // Set up an api for every role with cognito as the authorizer and oauth as the flow.
  const api = new ApiConstruct(stack, 'Api', {
    userPool: cognito.getUserPool(),
    userPoolName: cognito.getUserPoolName(),  
    userPoolDomain: cognito.getUserPoolDomain(),  
    cloudfrontDomain: cloudfront.getDistributionDomainName(),
    redirectPath: REDIRECT_PATH_WEBSITE,
    landscape: Landscape,
    exhibitFormsBucket: exhibitFormsBucket,
    databaseExhibitFormPurgeLambdaArn: delayedExecutionLambdas.databaseExhibitFormPurgeLambda.functionArn,
    disclosureRequestReminderLambdaArn: delayedExecutionLambdas.disclosureRequestReminderLambda.functionArn,
    bucketExhibitFormPurgeLambdaArn: delayedExecutionLambdas.bucketExhibitFormPurgeLambda.functionArn,
    handleStaleEntityVacancyLambdaArn: delayedExecutionLambdas.handleStaleEntityVacancyLambda.functionArn
  } as ApiConstructParms);

  // Grant the apis the necessary permissions (policy actions).
  api.grantPermissionsTo(dynamodb, cognito, exhibitFormsBucket);
  signupApi.grantPermissionsTo(dynamodb);

  const getStaticSiteParameters = (bucket:Bucket): StaticSiteConstructParms => {
    return {
      bucket,
      distributionId: cloudfront.getDistributionId(),
      cloudfrontDomain: cloudfront.getDistributionDomainName(),
      cognitoDomain: cognito.getUserPoolDomain(),
      cognitoUserpoolRegion: region,
      registerEntityApiUri: signupApi.registerEntityApiUri,
      registerConsenterApiUri: signupApi.registerConsenterApiUri,
      apis: [ 
        api.helloWorldApi.getApi(), 
        api.sysAdminApi.getApi(), 
        api.reAdminApi.getApi(), 
        api.authIndApi.getApi(),
        api.consentingPersonApi.getApi()
      ]
    } as StaticSiteConstructParms
  };

  const parameters = new ViewerRequestParametersConstruct(
    cloudfront, 'ViewerRequestParameters', 
    { 
      bootstrap: getStaticSiteParameters(bootstrapBucket), 
      website: getStaticSiteParameters(websiteBucket),
      context 
    }
  );
  
  // Set up the event, lambda and associated policies for modification of html files as they are uploaded 
  // to the bootstrap bucket and ensure that static html content is uploaded to it.
  const bootstrapStaticSite = new StaticSiteBootstrapConstruct(stack, 'StaticSiteBootstap', getStaticSiteParameters(bootstrapBucket));  
  bootstrapStaticSite.setBucketDeployment([ cloudfront, cognito ]);

  // Set up the non-bootstap bucket
  const websiteStaticSite = new StaticSiteWebsiteConstruct(stack, 'StaticSite', getStaticSiteParameters(websiteBucket));
  websiteStaticSite.setBucketDeployment([ cloudfront, cognito ]);

  // Set the cloudformation outputs.
  new CfnOutput(stack, 'CloudFrontURL', {
    value: `https://${cloudfront.getDistributionDomainName()}`,
    description: 'The domain name of the Cloudfront Distribution, such as d111111abcdef8.cloudfront.net.'
  });
  new CfnOutput(stack, 'CloudFrontURLBootstap', {
    value: `https://${cloudfront.getDistributionDomainName()}/bootstrap/index.htm`,
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
  const db = new DynamoDbConstruct(stack, 'Dynamodb');
  return db;
}

switch(scenario) {
  case SCENARIO.DEFAULT:
    buildAll();
    break;
  case SCENARIO.DYNAMODB:
    buildDynamoDb();
    break;
}


