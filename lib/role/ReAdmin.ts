import { ResourceServerScope, UserPool } from "aws-cdk-lib/aws-cognito";
import { AbstractFunction } from "../AbstractFunction";
import { Construct } from "constructs";
import { Runtime, Code } from "aws-cdk-lib/aws-lambda";
import path = require("path");
import { AbstractApi } from "./AbstractRole";
import { IContext } from "../../contexts/IContext";

export interface AdminUserParms {
  userPool: UserPool, 
  cloudfrontDomain: string,
}

export class AdminUserApi extends Construct {

  private api: AbstractApi;

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
      code: Code.fromAsset(path.join(__dirname, `lambda/user-admin`)),
      environment: {
        AWS_REGION: context.REGION
      }
    });

    this.api = new AbstractApi(scope, `${constructId}Api`, {
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

}