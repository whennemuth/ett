import { ResourceServerScope, UserPool } from "aws-cdk-lib/aws-cognito";
import { Function } from 'aws-cdk-lib/aws-lambda';
import { Construct } from "constructs";
import { Code, Runtime } from "aws-cdk-lib/aws-lambda";
import { AbstractRole, AbstractRoleApi } from "./AbstractRole";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { RemovalPolicy } from "aws-cdk-lib";
import { Roles } from  '../lambda/_lib/dao/entity';
import { IContext } from "../../contexts/IContext";

export interface HelloWorldParms {
  userPool: UserPool, 
  cloudfrontDomain: string,
  landscape: string
}

export class HelloWorldApi extends AbstractRole {

  private api: AbstractRoleApi;

  constructor(scope: Construct, constructId: string, parms: HelloWorldParms) {

    super(scope, constructId);

    const context:IContext = scope.node.getContext('stack-parms');
    const { STACK_ID} = context;
    const { userPool, cloudfrontDomain, landscape } = parms;
    const functionName = `${STACK_ID}-${landscape}-${Roles.HELLO_WORLD}-user`;

    const lambdaFunction = new Function(scope, `${constructId}Lambda`, {
      runtime: Runtime.NODEJS_18_X,
      handler: 'index.handler',
      functionName,
      description: 'Just a simple lambda for testing cognito authorization',
      code: Code.fromInline(`
      exports.handler = async (event) => {
        console.log(JSON.stringify(event, null, 2));

        // https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-output-format
        // https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-cors.html#apigateway-enable-cors-proxy
        const response = {
          isBase64Encoded: false,
          statusCode: 200,
          headers: {
              "Access-Control-Allow-Headers" : "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent",
              "Access-Control-Allow-Origin": "https://${cloudfrontDomain}",
              "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
              "Access-Control-Allow-Credentials": "true"
          },
          body: JSON.stringify({ message: 'Ping!' }),
        };
  
        return response;
      };`
    )});

    const log_group = new LogGroup(this, `${constructId}LogGroup`, {
      logGroupName: `/aws/lambda/${functionName}`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    log_group.grantWrite(lambdaFunction);
    
    this.api = new AbstractRoleApi(scope, `${constructId}Api`, {
      cloudfrontDomain,
      lambdaFunction,
      userPool,
      role: Roles.HELLO_WORLD,
      roleFullName: 'Hello World Tester',
      description: 'Simple hello world api for initial proving of authentication and scopes',
      bannerImage: 'client-hello-world.png',
      resourceId: Roles.HELLO_WORLD,
      methods: [ 'POST', 'GET' ],
      scopes: [
        new ResourceServerScope({ scopeName: 'read', scopeDescription: 'Read-only access' }),
        new ResourceServerScope({ scopeName: 'full-access', scopeDescription: 'Full access' })    
      ]
    });
  }

  public getApi(): AbstractRoleApi {
    return this.api;
  }

  public getLambdaFunction(): Function {
    return this.api.getLambdaFunction();
  }

}