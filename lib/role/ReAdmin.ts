import { ResourceServerScope, UserPool } from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import { AbstractRoleApi } from "./AbstractRole";
import { Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { AbstractFunction } from "../AbstractFunction";
import { DynamoDbConstruct } from "../DynamoDb";
import { Roles } from '../lambda/dao/entity';

export interface AdminUserParms {
  userPool: UserPool, 
  cloudfrontDomain: string,
}

export class ReAdminUserApi extends Construct {
  private api: AbstractRoleApi;

  constructor(scope: Construct, constructId: string, parms: AdminUserParms) {

    super(scope, constructId);

    const { userPool, cloudfrontDomain } = parms;
    const lambdaFunction = new LambdaFunction(scope, `${constructId}Lambda`);

    this.api = new AbstractRoleApi(scope, `${constructId}Api`, {
      cloudfrontDomain,
      lambdaFunction,
      userPool,
      role: Roles.RE_ADMIN,
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

/**
 * Just the lambda function without the api gateway and cognito scoping resources.
 */
export class LambdaFunction extends AbstractFunction {
  constructor(scope: Construct, constructId: string) {
    super(scope, constructId, {
      runtime: Runtime.NODEJS_18_X,
      entry: 'lib/lambda/functions/re-admin/ReAdminUser.ts',
      // handler: 'handler',
      functionName: constructId,
      description: 'Function for all re admin user activity.',
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      environment: {
        REGION: scope.node.getContext('stack-parms').REGION,
        DYNAMODB_USER_TABLE_NAME: DynamoDbConstruct.DYNAMODB_TABLES_USERS_TABLE_NAME
      }
    });
  }
}
