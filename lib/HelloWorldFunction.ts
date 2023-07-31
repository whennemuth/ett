import { Construct } from 'constructs';
import { IContext } from '../contexts/IContext';
import { Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { AbstractFunction } from './AbstractFunction';
import { RestApi, LambdaIntegration, IAuthorizer } from 'aws-cdk-lib/aws-apigateway';

export class HelloWorldFunction extends AbstractFunction {

  constructor(scope: Construct, constructId: string) {

    super(scope, constructId, {
      runtime: Runtime.NODEJS_18_X,
      handler: 'index.handler',
      functionName: constructId,
      description: 'Just a simple lambda for testing cognito authorization',
      cleanup: true,
      code: Code.fromInline(`
        exports.handler = async (event) => {
          console.log(JSON.stringify(event, null, 2));
          return {
            statusCode: 200,
            {},
            { message: "howdy!" },
          };
        };
      `)
    });
  };

  public createAuthorizedResource(resourcePath: string, authorizer: IAuthorizer): string {

    const stageName = this.context.TAGS.Landscape;

    const api = new RestApi(this, 'RestApi', {
      deployOptions: { 
        stageName,
        description: 'Rest API for to be integrated with lambda for testing cognito authorization' 
      },
    });

    const integration = new LambdaIntegration(this);
    const endpointResource = api.root.addResource(resourcePath);
    endpointResource.addMethod('GET', integration, { authorizer });

    // return `${api.domainName}/${resourcePath}`;
    return `https://${api.restApiId}.execute-api.${this.context.REGION}.amazonaws.com/${stageName}/myendpoint`
  }

}