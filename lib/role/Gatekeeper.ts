import { Construct } from "constructs";
import { AbstractRoleApi } from "./AbstractRole";
import { ResourceServerScope } from "aws-cdk-lib/aws-cognito";
import { AbstractFunction } from "../AbstractFunction";
import { Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { DynamoDbConstruct } from "../DynamoDb";
import { Roles } from '../lambda/_lib/dao/entity';
import { ApiParms } from "../Api";

export class GatekeeperApi extends Construct {
  private api: AbstractRoleApi;
  
  constructor(scope: Construct, constructId: string, parms: ApiParms) {

    super(scope, constructId);

    const { userPool, cloudfrontDomain } = parms;
    const lambdaFunction = new LambdaFunction(scope, `${constructId}Lambda`, parms);

    this.api = new AbstractRoleApi(scope, `${constructId}Api`, {
      cloudfrontDomain,
      lambdaFunction,
      userPool,
      role: Roles.GATEKEEPER,
      description: 'Api for all operations that are open to a gatekeeper',
      bannerImage: 'client-gatekeeper.png',
      resourceId: 'gatekeeper',
      methods: [ 'POST', 'GET' ],
      scopes: [
        new ResourceServerScope({ 
          scopeName: 'entity-administration', 
          scopeDescription: 'Access to create/modify the registered entity listing'
        }),
        new ResourceServerScope({
          scopeName: 'invitations',
          scopeDescription: 'Access to invite non-public users for ETT signup'
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
  constructor(scope: Construct, constructId: string, parms:ApiParms) {
    super(scope, constructId, {
      runtime: Runtime.NODEJS_18_X,
      entry: 'lib/lambda/functions/gatekeeper/GatekeeperUser.ts',
      // handler: 'handler',
      functionName: constructId,
      description: 'Function for all gatekeeper user activity.',
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      environment: {
        REGION: scope.node.getContext('stack-parms').REGION,
        DYNAMODB_USER_TABLE_NAME: DynamoDbConstruct.DYNAMODB_TABLES_USERS_TABLE_NAME,
        DYNAMODB_ENTITY_TABLE_NAME: DynamoDbConstruct.DYNAMODB_TABLES_ENTITY_TABLE_NAME,
        DYNAMODB_INVITATION_TABLE_NAME: DynamoDbConstruct.DYNAMODB_TABLES_INVITATION_TABLE_NAME,
        USERPOOL_NAME: parms.userPoolName,
        CLOUDFRONT_DOMAIN: parms.cloudfrontDomain,
        REDIRECT_PATH: parms.redirectPath
      }
    });
  }
}