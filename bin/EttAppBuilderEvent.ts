import { IContext } from "../contexts/IContext";
import { CloudfrontConstruct } from "../lib/Cloudfront";
import { CognitoConstruct } from "../lib/lambda/Cognito";
import { StaticSiteConstruct } from "../lib/StaticSite";
import { StaticSiteCustomInConstruct } from "../lib/StaticSiteCustomIn";
import { AppBuilder } from "./EttAppBuilder";
import { HelloWorldApi } from "../lib/role/HelloWorld";
import { DynamoDbConstruct } from "../lib/DynamoDb";
import { ReAdminUserApi } from '../lib/role/ReAdmin';

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

    // Set up the dynamodb table for users.
    this.dynamodb = new DynamoDbConstruct(this.stack, 'EttDynamodb', { });

    // Set up the api gateway resources.
    const apiParms = {
      userPool: this.cognito.getUserPool(),
      cloudfrontDomain: this.cloudfront.getDistributionDomainName()
    }

    // Set up the hello world api
    this.helloWorldApi = new HelloWorldApi(this.stack, 'HelloWorld', apiParms);

    // Set up the api for registered entity administrators.
    this.reAdminApi = new ReAdminUserApi(this.stack, 'ReAdminUser', apiParms);

    // Grant the reAdmin lambda function the ability to read and write from the dynamodb users table.
    this.dynamodb.getUsersTable().grantReadWriteData(this.reAdminApi.getLambdaFunction());

    // Grant the reAdmin lambda function the ability to read from the dynamodb users table
    this.cognito.getUserPool().grant(this.reAdminApi.getLambdaFunction(), 
      'cognito-identity:Describe*', 
      'cognito-identity:Get*', 
      'cognito-identity:List*'
    );

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
