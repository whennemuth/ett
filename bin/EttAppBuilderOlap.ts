import { IContext } from "../contexts/IContext";
import { CloudfrontConstruct } from "../lib/Cloudfront";
import { CognitoConstruct } from "../lib/Cognito";
import { HelloWorldApi } from "../lib/HelloWorldApi";
import { StaticSiteCustomOutConstruct } from "../lib/StaticSiteCustomOut";
import { AppBuilder } from "./EttAppBuilder";

export class AppBuilderOlap extends AppBuilder {

  constructor(context:IContext) {
    super(context);
  }

  buildResources(): void {
    // Set up the bucket, ap, olap, lambda, and associated polices for modification of html files read from the bucket.
    this.staticSite = new StaticSiteCustomOutConstruct(this.stack, 'EttStaticSite');

    // Set up the cloudfront distribution, origins, behaviors, and oac
    this.cloudfront = new CloudfrontConstruct(this.stack, 'EttCloudfront', {
      bucket: this.staticSite.getBucket(),
      olapAlias: (<StaticSiteCustomOutConstruct>this.staticSite).getOlapAlias()
    });

    // Set up the cognito userpool and userpool client
    this.cognito = new CognitoConstruct(this.stack, 'EttCognito', { distribution: {
      domainName: this.cloudfront.getDistributionDomainName()
    }});

    this.helloWorldApi = new HelloWorldApi(this.stack, 'HelloWorldLambda', {
      userPool: this.cognito.getUserPool(),
      cloudfrontDomain: this.cloudfront.getDistributionDomainName()
    });

    // INCOMPLETE FUNCTIONALITY:
    // Create a parmeter store construct here.
    // If using this construct, you will need to get this.helloWorldFunction.getUserPoolClientId()
    // and all other values to be injected into html page into parameter store first. Then adjust the
    // object lambda code to reach into the parameter store for these values in order to "inject" them. 
  }

}