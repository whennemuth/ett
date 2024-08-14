import { ResourceServerScope } from "aws-cdk-lib/aws-cognito";
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { IContext } from "../../contexts/IContext";
import { AbstractFunction } from "../AbstractFunction";
import { ApiConstructParms } from "../Api";
import { Roles } from "../lambda/_lib/dao/entity";
import { AbstractRole, AbstractRoleApi } from "./AbstractRole";
import { Configurations } from "../lambda/_lib/config/Config";


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
    const { STACK_ID, ACCOUNT, REGION, CONFIG } = context;
    const { userPool, landscape, exhibitFormsBucketName } = parms;
    const { userPoolId, userPoolArn } = userPool;
    super(scope, constructId, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
      entry: 'lib/lambda/functions/authorized-individual/AuthorizedIndividual.ts',
      // handler: 'handler',
      functionName: `${STACK_ID}-${landscape}-${Roles.RE_AUTH_IND}-user`,
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
                  `arn:aws:ses:${REGION}:${ACCOUNT}:identity/*`
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
        REGION,
        USERPOOL_ID: userPoolId,
        EXHIBIT_FORMS_BUCKET_NAME: exhibitFormsBucketName,
        [Configurations.ENV_VAR_NAME]: new Configurations(CONFIG).getJson()
      }
    });
  }
}