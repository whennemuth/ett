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
import { DelayedExecutions } from "../DelayedExecution";
import { Duration } from "aws-cdk-lib";
import { ExhibitFormsBucketEnvironmentVariableName } from "../lambda/functions/consenting-person/BucketItemMetadata";


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
    const { userPool, cloudfrontDomain, landscape, exhibitFormsBucket, disclosureRequestReminderLambdaArn, handleStaleEntityVacancyLambdaArn } = parms;
    const { userPoolId, userPoolArn } = userPool;
    const prefix = `${STACK_ID}-${landscape}`;
    super(scope, constructId, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
      timeout: Duration.seconds(15),
      entry: 'lib/lambda/functions/authorized-individual/AuthorizedIndividual.ts',
      // handler: 'handler',
      functionName: `${prefix}-${Roles.RE_AUTH_IND}-user`,
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
          }),
          'EttAuthIndEventBridgePolicy': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'events:DeleteRule', 'events:DisableRule', 'events:EnableRule', 'events:PutRule', 'events:PutTargets', 'events:RemoveTargets' ],
                resources: [
                  `arn:aws:events:${REGION}:${ACCOUNT}:rule/ett-*`
                ],
                effect: Effect.ALLOW
              }),
              new PolicyStatement({
                actions: [ 'events:List*', 'events:Describe*' ],
                resources: [
                  `arn:aws:events:${REGION}:${ACCOUNT}:rule/*`
                ],
                effect: Effect.ALLOW
              }),
              new PolicyStatement({
                actions: [ 'lambda:AddPermission' ],
                resources: [
                  `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${prefix}-${DelayedExecutions.DisclosureRequestReminder.coreName}`,
                  `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${prefix}-${DelayedExecutions.HandleStaleEntityVacancy.coreName}`
                ],
                effect: Effect.ALLOW
              })
            ]
          }),
          'EttAuthIndExhibitFormBucketPolicy': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 's3:*' ],
                resources: [ exhibitFormsBucket.bucketArn, `${exhibitFormsBucket.bucketArn}/*` ],
                effect: Effect.ALLOW
              })
            ]
          })
        }
      }),
      environment: {
        REGION,
        CLOUDFRONT_DOMAIN: cloudfrontDomain,
        USERPOOL_ID: userPoolId,
        PREFIX: prefix,
        [ExhibitFormsBucketEnvironmentVariableName]: exhibitFormsBucket.bucketName,
        [DelayedExecutions.DisclosureRequestReminder.targetArnEnvVarName]: disclosureRequestReminderLambdaArn,
        [DelayedExecutions.HandleStaleEntityVacancy.targetArnEnvVarName]: handleStaleEntityVacancyLambdaArn,
        [Configurations.ENV_VAR_NAME]: new Configurations(CONFIG).getJson()
      }
    });
  }
}