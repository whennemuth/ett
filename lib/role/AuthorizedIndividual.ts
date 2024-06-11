import { Construct } from "constructs";
import { AbstractRole, AbstractRoleApi } from "./AbstractRole";
import { ApiConstructParms } from "../Api";
import { AbstractFunction } from "../AbstractFunction";
import { Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { DynamoDbConstruct } from "../DynamoDb";
import { Roles } from "../lambda/_lib/dao/entity";
import { ResourceServerScope } from "aws-cdk-lib/aws-cognito";
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { IContext } from "../../contexts/IContext";


export class AuthorizedIndividualApi extends AbstractRole {
  private api: AbstractRoleApi

  constructor(scope: Construct, constructId: string, parms: ApiConstructParms) {

    super(scope, constructId);

    const { userPool, cloudfrontDomain } = parms;
    const lambdaFunction = new LambdaFunction(scope, `${constructId}Lambda`, parms);

    this.api = new AbstractRoleApi(scope, `${constructId}Api`, {
      cloudfrontDomain,
      lambdaFunction,
      userPool,
      role: Roles.RE_AUTH_IND,
      roleFullName: 'Authorized Individual',
      description: 'Api for all operations that are open to an authorized individual',
      bannerImage: 'client-auth-ind.png',
      resourceId: Roles.RE_AUTH_IND,
      methods: [ 'POST', 'GET' ],
      scopes: [
        new ResourceServerScope({ 
          scopeName: 'manage-applicants', 
          scopeDescription: 'Access to inspect and correspond with consenting individuals'
        }),
        new ResourceServerScope({
          scopeName: 'manage-affiliates',
          scopeDescription: 'Access to inspect and correspond with affliates'
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
    const { userPool } = parms;
    const { userPoolId, userPoolArn } = userPool;
    super(scope, constructId, {
      runtime: Runtime.NODEJS_18_X,
      entry: 'lib/lambda/functions/authorized-individual/AuthorizedIndividual.ts',
      // handler: 'handler',
      functionName: `Ett${constructId}`,
      description: 'Function for all authorized individual activity.',
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(scope, 'AuthIndRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        description: `Grants actions to the ${Roles.RE_AUTH_IND} lambda function to perform the related api tasks.`,
        inlinePolicies: {
          'EttAuthIndSesPolicy': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'ses:Send*', 'ses:Get*' ],
                resources: [
                  `arn:aws:ses:${context.REGION}:${context.ACCOUNT}:identity/*`
                ],
                effect: Effect.ALLOW
              })
            ]
          }),
          'EttAuthIndCognitoPolicy': new PolicyDocument({
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
        REGION: scope.node.getContext('stack-parms').REGION,
        DYNAMODB_USER_TABLE_NAME: DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME,
        DYNAMODB_ENTITY_TABLE_NAME: DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME,
        DYNAMODB_INVITATION_TABLE_NAME: DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME,
        DYNAMODB_INVITATION_ENTITY_INDEX: DynamoDbConstruct.DYNAMODB_INVITATION_ENTITY_INDEX,
        DYNAMODB_INVITATION_EMAIL_INDEX: DynamoDbConstruct.DYNAMODB_INVITATION_EMAIL_INDEX,
        DYNAMODB_CONSENTER_TABLE_NAME: DynamoDbConstruct.DYNAMODB_CONSENTER_TABLE_NAME,
        USERPOOL_ID: userPoolId
      }
    });
  }
}