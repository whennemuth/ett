import { IContext } from '../../contexts/IContext';
import { Construct } from "constructs";
import { AbstractRole, AbstractRoleApi } from "./AbstractRole";
import { ResourceServerScope } from "aws-cdk-lib/aws-cognito";
import { AbstractFunction } from "../AbstractFunction";
import { Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { DynamoDbConstruct } from "../DynamoDb";
import { Roles } from '../lambda/_lib/dao/entity';
import { ApiConstructParms } from "../Api";
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';

export class SysAdminApi extends AbstractRole {
  private api: AbstractRoleApi;
  
  constructor(scope: Construct, constructId: string, parms: ApiConstructParms) {

    super(scope, constructId);

    const { userPool, cloudfrontDomain } = parms;
    const lambdaFunction = new LambdaFunction(scope, `${constructId}Lambda`, parms);

    this.api = new AbstractRoleApi(scope, `${constructId}Api`, {
      cloudfrontDomain,
      lambdaFunction,
      userPool,
      role: Roles.SYS_ADMIN,
      description: 'Api for all operations that are open to a system admin',
      bannerImage: 'client-sysadmin.png',
      resourceId: Roles.SYS_ADMIN,
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
  constructor(scope: Construct, constructId: string, parms:ApiConstructParms) {
    const context:IContext = scope.node.getContext('stack-parms');
    const redirectURI = `${parms.cloudfrontDomain}/${parms.redirectPath}`.replace('//', '/');
    super(scope, constructId, {
      runtime: Runtime.NODEJS_18_X,
      entry: 'lib/lambda/functions/sys-admin/SysAdminUser.ts',
      // handler: 'handler',
      functionName: `Ett${constructId}`,
      description: 'Function for all sys admin user activity.',
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(scope, 'SysAdminRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        description: 'Grants access to SES for invitations',
        inlinePolicies: {
          'SendEmails': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'ses:Send*', 'ses:Get*' ],
                resources: [ `arn:aws:ses:${context.REGION}:${context.ACCOUNT}:identity/${context.SES_IDENTITY}` ],
                effect: Effect.ALLOW
              })
            ]
          })
        }
      }),
      environment: {
        REGION: context.REGION,
        DYNAMODB_USER_TABLE_NAME: DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME,
        DYNAMODB_ENTITY_TABLE_NAME: DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME,
        DYNAMODB_INVITATION_TABLE_NAME: DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME,
        USERPOOL_NAME: parms.userPoolName,
        COGNITO_DOMAIN: parms.userPoolDomain,
        CLOUDFRONT_DOMAIN: parms.cloudfrontDomain,
        REDIRECT_URI: redirectURI
      }
    });
  }
}