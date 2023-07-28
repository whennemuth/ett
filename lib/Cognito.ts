import { Construct } from 'constructs';
import { IContext } from '../contexts/IContext';
import { UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { HelloWorldFunction } from './HelloWorldFunction'; 
import { CognitoUserPoolsAuthorizer } from 'aws-cdk-lib/aws-apigateway';
import { Stack, CfnOutput } from 'aws-cdk-lib';

export class CognitoConstruct extends Construct {

  constructId: string;
  scope: Construct;
  context: IContext;
  userPool: UserPool;
  userPoolClient: UserPoolClient;

  constructor(scope: Construct, constructId: string) {

    super(scope, constructId);

    this.scope = scope;
    this.constructId = constructId;
    this.context = scope.node.getContext('stack-parms');

    this.buildResources();
  }

  buildResources(): void {

    this.userPool = new UserPool(this, `${this.constructId}-userpool`, {
      userPoolName: `${this.constructId}-userpool`,
    });

    this.userPoolClient = new UserPoolClient(this, `${this.constructId}-userpoolclient`, {
      userPool: this.userPool,
      userPoolClientName: `${this.constructId}-userpoolclient`,
    });

    const authorizer = new CognitoUserPoolsAuthorizer(this, `${this.constructId}-authorizer`, {
      authorizerName: `${this.constructId}-authorizer`,
      cognitoUserPools: [ this.userPool ],
      identitySource: 'method.request.header.Authorization',
    });

    // Create a simple test api endpoint with backing lambda for testing out the authorizer.
    const helloWorldFunction = new HelloWorldFunction(this, `${this.constructId}-lambda-helloworld`);
    helloWorldFunction.createAuthorizedResource('hello-world', authorizer);

    // Output the CloudFront distribution endpoint
    if( this.scope instanceof Stack) {
      new CfnOutput((<Stack> this.scope), 'UserPoolProviderUrl', {
        value: this.userPool.userPoolProviderUrl,
        description: 'User pool provider URL'
      });
    };
    
  }

  public getUserPool(): UserPool {
    return this.userPool;
  }

  public getUserPoolClient(): UserPoolClient {
    return this.userPoolClient;
  }
};
