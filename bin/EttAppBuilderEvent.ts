import { IContext } from "../contexts/IContext";
import { CloudfrontConstruct } from "../lib/Cloudfront";
import { CognitoConstruct } from "../lib/Cognito";
import { StaticSiteConstruct } from "../lib/StaticSite";
import { StaticSiteCustomInConstruct } from "../lib/StaticSiteCustomIn";
import { AppBuilder } from "./EttAppBuilder";
import { HelloWorldApi } from "../lib/role/HelloWorld";

export class AppBuilderEvent extends AppBuilder {

  constructor(context:IContext) {
    super(context);
  }

  buildResources(): void {
    // Set up the bucket only.
    const bucket = new class extends StaticSiteConstruct{
      public customize(): void { console.log('No customization'); }
    }(this.stack, 'EttStaticSiteBucket', {}).getBucket() ;

    // Set up the cloudfront distribution, origins, behaviors, and oac
    this.cloudfront = new CloudfrontConstruct(this.stack, 'EttCloudfront', { bucket });

    // Set up the cognito userpool and userpool client
    this.cognito = new CognitoConstruct(this.stack, 'EttCognito', { distribution: {
      domainName: this.cloudfront.getDistributionDomainName()
    }});

    this.helloWorldApi = new HelloWorldApi(this.stack, 'HelloWorld', {
      userPool: this.cognito.getUserPool(),
      cloudfrontDomain: this.cloudfront.getDistributionDomainName()
    });

    // Set up the event, lambda and associated policies for modification of html files as they are uploaded to the bucket.
    this.staticSite = new StaticSiteCustomInConstruct(this.stack, 'EttStaticSite', {
      bucket,
      cognitoClientId: this.helloWorldApi.getUserPoolClientId(),
      cognitoDomain: this.cognito.getUserPoolDomain(),
      cognitoRedirectURI: `${this.cloudfront.getDistributionDomainName()}/index.htm`,
      cognitoUserpoolRegion: this.context.REGION,
      distributionId: this.cloudfront.getDistributionId(),
      apiUris: [ { name: 'HELLO_WORLD_API_URI', value: this.helloWorldApi.getRestApiUrl() } ]
    });  
  }
}
