import { IContext } from '../../contexts/IContext';
import { ResourceServerScope, UserPool } from "aws-cdk-lib/aws-cognito";
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from "constructs";
import { AbstractFunction } from "../AbstractFunction";
import { DynamoDbConstruct } from "../DynamoDb";
import { Roles } from '../lambda/_lib/dao/entity';
import { AbstractRole, AbstractRoleApi } from "./AbstractRole";

export interface AdminUserParms {
  userPool: UserPool, 
  cloudfrontDomain: string,
}

export class ReAdminUserApi extends AbstractRole {
  private api: AbstractRoleApi;

  constructor(scope:Construct, constructId:string, parms:AdminUserParms) {

    super(scope, constructId);

    const { userPool, cloudfrontDomain } = parms;
    const lambdaFunction = new LambdaFunction(scope, `${constructId}Lambda`, parms);

    this.api = new AbstractRoleApi(scope, `${constructId}Api`, {
      cloudfrontDomain,
      lambdaFunction,
      userPool,
      role: Roles.RE_ADMIN,
      roleFullName: 'Registered Entity Administrator',
      description: 'Api for all operations that are open to a registered entity administrator',
      bannerImage: 'client-admin.png',
      resourceId: Roles.RE_ADMIN,
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

  public getApi(): AbstractRoleApi {
    return this.api;
  }

  public getLambdaFunction(): Function {
    return this.api.getLambdaFunction();
  }
}

/**
 * Just the lambda function without the api gateway and cognito scoping resources.
 */
export class LambdaFunction extends AbstractFunction {
  constructor(scope:Construct, constructId:string, parms:AdminUserParms) {
    const context:IContext = scope.node.getContext('stack-parms');
    const { userPool, cloudfrontDomain } = parms;
    const { userPoolArn, userPoolId } = userPool;
    
    super(scope, constructId, {
      runtime: Runtime.NODEJS_18_X,
      entry: 'lib/lambda/functions/re-admin/ReAdminUser.ts',
      // handler: 'handler',
      functionName: `Ett${constructId}`,
      memorySize: 512,
      description: 'Function for all re admin user activity.',
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(scope, 'ReAdminRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        description: 'Grants access to SES for invitations',
        inlinePolicies: {
          'SendEmails': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'ses:Send*', 'ses:Get*' ],
                resources: context.SES_IDENTITIES.map((identity:string) => {
                  return `arn:aws:ses:${context.REGION}:${context.ACCOUNT}:identity/${identity}`
                }),
                effect: Effect.ALLOW
              })
            ]
          }),
          'QueryCognito': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [  'cognito-idp:List*'  ],
                resources: [ '*' ],
                effect: Effect.ALLOW
              }),
              new PolicyStatement({
                actions: [  'cognito-idp:AdminGet*', 'cognito-idp:AdminDeleteUser' ],
                resources: [ userPoolArn ],
                effect: Effect.ALLOW
              })
            ]
          })
        }
      }),
      environment: {
        REGION: context.REGION,
        DYNAMODB_USER_TABLE_NAME: DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME,
        DYNAMODB_INVITATION_TABLE_NAME: DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME,
        DYNAMODB_ENTITY_TABLE_NAME: DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME,
        CLOUDFRONT_DOMAIN: cloudfrontDomain,
        USERPOOL_ID: userPoolId
      }
    });
  }
}
