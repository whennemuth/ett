import { App, StackProps, CfnOutput } from 'aws-cdk-lib';
import { IContext } from '../contexts/IContext';
import { CognitoConstruct } from '../lib/Cognito';
import { AbstractStack } from '../lib/AbstractStack';
import { CloudfrontConstruct } from '../lib/Cloudfront';
import { StaticSiteConstruct } from '../lib/StaticSite';
import { HelloWorldFunction } from '../lib/HelloWorldFunction';

export abstract class AppBuilder {

  context: IContext;
  stack: AbstractStack;
  staticSite: StaticSiteConstruct;
  cloudfront: CloudfrontConstruct;
  cognito: CognitoConstruct;
  helloWorldFunction: HelloWorldFunction
  
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
    this.helloWorldFunction = new HelloWorldFunction(this.stack, 'HelloWorldLambda');
  }

  public build(): void {

    this.buildResources();
    
    this.staticSite.setIndexFileForUpload([ this.cloudfront, this.cognito]);

    new CfnOutput(this.stack, 'CloudFrontURL', {
      value: `https://${this.cloudfront.getDistributionDomainName()}`,
      description: 'The domain name of the Cloudfront Distribution, such as d111111abcdef8.cloudfront.net.'
    });
    new CfnOutput(this.stack, 'UserPoolProviderUrl', {
      value: this.cognito.getUserPool().userPoolProviderUrl,
      description: 'User pool provider URL'
    });    
    new CfnOutput(this.stack, 'HelloWorldApiUri', {
      value: this.helloWorldFunction.getRestApiUrl(),
      description: 'Hello world api uri, just for testing access.'
    });  
  }

  protected abstract buildResources(): void
}