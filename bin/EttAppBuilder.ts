import { App, StackProps, CfnOutput } from 'aws-cdk-lib';
import { IContext } from '../contexts/IContext';
import { CognitoConstruct } from '../lib/lambda/Cognito';
import { AbstractStack } from '../lib/AbstractStack';
import { CloudfrontConstruct } from '../lib/Cloudfront';
import { StaticSiteConstruct } from '../lib/StaticSite';
import { DynamoDbConstruct } from "../lib/DynamoDb";
import { HelloWorldApi } from '../lib/role/HelloWorld';
import { ReAdminUserApi } from '../lib/role/ReAdmin';

/**
 * This abstract class provides baseline functionality via the template design pattern such that 
 * all subclasses create the resources, but the shared functionality is "templated" here, like bucket 
 * index file uploading, setting of cloudformation outputs, etc.
 */
export abstract class AppBuilder {

  protected context: IContext;
  protected stack: AbstractStack;
  protected staticSite: StaticSiteConstruct;
  protected cloudfront: CloudfrontConstruct;
  protected cognito: CognitoConstruct;
  protected dynamodb: DynamoDbConstruct;
  helloWorldApi: HelloWorldApi;
  protected reAdminApi: ReAdminUserApi;
  
  constructor(context:IContext) {
    this.context = context;
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

    this.stack = new AbstractStack(app, stackName, stackProps);
  }

  public build(): void {

    // Build each resource for the stack.
    this.buildResources();
    
    // Ensure that static html content is uploaded to the bucket that was created.
    this.staticSite.setIndexFileForUpload([ this.cloudfront, this.cognito]);

    // Set the cloudformation outputs.
    new CfnOutput(this.stack, 'CloudFrontURL', {
      value: `https://${this.cloudfront.getDistributionDomainName()}`,
      description: 'The domain name of the Cloudfront Distribution, such as d111111abcdef8.cloudfront.net.'
    });
    new CfnOutput(this.stack, 'UserPoolProviderUrl', {
      value: this.cognito.getUserPool().userPoolProviderUrl,
      description: 'User pool provider URL'
    });    
    new CfnOutput(this.stack, 'HelloWorldApiUri', {
      value: this.helloWorldApi.getRestApiUrl(),
      description: 'Hello world api uri, just for testing access.'
    });  
  }

  protected abstract buildResources(): void
}