import { ResourceServerScope, UserPool } from "aws-cdk-lib/aws-cognito";
import { AbstractFunction } from "../AbstractFunction";
import { Construct } from "constructs";
import { Runtime, Code } from "aws-cdk-lib/aws-lambda";
import path = require("path");
import { AbstractRoleApi } from "./AbstractRole";
import { IContext } from "../../contexts/IContext";
import { Function } from 'aws-cdk-lib/aws-lambda';
import { DynamoDbConstruct } from "../DynamoDb";

export interface AdminUserParms {
  userPool: UserPool, 
  cloudfrontDomain: string,
}

export class ReAdminUserApi extends Construct {
  private api: AbstractRoleApi;

  constructor(scope: Construct, constructId: string, parms: AdminUserParms) {

    super(scope, constructId);

    const { userPool, cloudfrontDomain } = parms;
    const context: IContext = scope.node.getContext('stack-parms');

    const lambdaFunction = new AbstractFunction(scope, `${constructId}Lambda`, {
      runtime: Runtime.NODEJS_18_X,
      handler: 'User.handler',
      functionName: `${constructId}Lambda`,
      description: 'Just a simple lambda for testing cognito authorization',
      cleanup: true,
      code: Code.fromAsset(path.join(__dirname, `../lambda/re-admin`)),
      environment: {
        REGION: context.REGION,
        DYNAMODB_USER_TABLE_NAME: DynamoDbConstruct.DYNAMODB_TABLES_USERS_TABLE_NAME
      }
    });

    this.api = new AbstractRoleApi(scope, `${constructId}Api`, {
      cloudfrontDomain,
      lambdaFunction,
      userPool,
      roleName: 're-admin',
      description: 'Api for all operations that are open to a registered entity administrator',
      bannerImage: 'client-admin.png',
      resourceId: 'admin',
      methods: [ 'POST', 'GET' ],
      scopes: [
        new ResourceServerScope({ 
          scopeName: 'invite-auth-ind', 
          scopeDescription: 'Access to invite an RE authorized individual to create an account'
        }),
        new ResourceServerScope({
          scopeName: 'create-entity',
          scopeDescription: 'Access to establish the entity for registration with ETT'
        })
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