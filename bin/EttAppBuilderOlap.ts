import { IContext } from "../contexts/IContext";
import { CloudfrontConstruct } from "../lib/Cloudfront";
import { CognitoConstruct } from "../lib/Cognito";
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

    const helloWorldUserPoolClient = this.helloWorldFunction.createAuthorizedResource(
      'hello-world', 
      this.cognito.getUserPool(), 
      this.cloudfront.getDistributionDomainName());

    // If using this construct, would need to get the client_id of helloWorldUserPoolClient 
  }

}