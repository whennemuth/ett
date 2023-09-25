import { ResourceServerScope, UserPool } from "aws-cdk-lib/aws-cognito";
import { Function } from 'aws-cdk-lib/aws-lambda';
import { AbstractFunction } from "../AbstractFunction";
import { Construct } from "constructs";
import { Code, Runtime } from "aws-cdk-lib/aws-lambda";
import { AbstractRoleApi } from "./AbstractRole";

export interface HelloWorldParms {
  userPool: UserPool, 
  cloudfrontDomain: string
}

export class HelloWorldApi extends Construct {

  private api: AbstractRoleApi;

  constructor(scope: Construct, constructId: string, parms: HelloWorldParms) {

    super(scope, constructId);

    const { userPool, cloudfrontDomain } = parms;

    const lambdaFunction = new AbstractFunction(scope, `${constructId}Lambda`, {
      runtime: Runtime.NODEJS_18_X,
      handler: 'index.handler',
      functionName: `${constructId}Lambda`,
      description: 'Just a simple lambda for testing cognito authorization',
      cleanup: true,
      code: Code.fromInline(`
      exports.handler = async (event) => {
        console.log(JSON.stringify(event, null, 2));

        // https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-output-format
        const response = {
          isBase64Encoded: false,
          statusCode: 200,
          headers: {
              "Access-Control-Allow-Headers" : "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent",
              "Access-Control-Allow-Origin": "https://${cloudfrontDomain}",
              "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
              "Access-Control-Allow-Credentials": "true"
          },
          body: JSON.stringify('Hello from lambda function!'),
        };
  
        return response;
      };`
    )});

    this.api = new AbstractRoleApi(scope, `${constructId}Api`, {
      cloudfrontDomain,
      lambdaFunction,
      userPool,
      roleName: 'hello-world',
      description: 'Simple hello world api for initial proving of authentication and scopes',
      bannerImage: 'client-hello-world.png',
      resourceId: 'greeting',
      methods: [ 'POST', 'GET' ],
      scopes: [
        new ResourceServerScope({ scopeName: 'read', scopeDescription: 'Read-only access' }),
        new ResourceServerScope({ scopeName: 'full-access', scopeDescription: 'Full access' })    
      ]
    });
  }

  public getRestApiUrl(): string {
    return this.api.getRestApiUrl();
  }

  public getUserPoolClientId(): string {
    return this.api.getUserPoolClientId();
  }

  public getLambdaFunction(): Function {
    return this.api.getLambdaFunction();
  }
}