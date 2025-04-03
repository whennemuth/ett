import { ResourceServerScope, UserPool } from "aws-cdk-lib/aws-cognito";
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from "constructs";
import { IContext } from '../../contexts/IContext';
import { AbstractFunction } from "../AbstractFunction";
import { roleFullName, Roles } from '../lambda/_lib/dao/entity';
import { AbstractRole, AbstractRoleApi } from "./AbstractRole";
import { Configurations } from "../lambda/_lib/config/Config";
import { ApiConstructParms } from "../Api";
import { Duration } from "aws-cdk-lib";
import { DelayedExecutions } from "../DelayedExecution";
import { ExhibitFormsBucketEnvironmentVariableName } from "../lambda/functions/consenting-person/BucketItemMetadata";

export class ReAdminUserApi extends AbstractRole {
  private api: AbstractRoleApi;

  constructor(scope:Construct, constructId:string, parms:ApiConstructParms) {

    super(scope, constructId);

    const { userPool, cloudfrontDomain } = parms;
    const lambdaFunction = new LambdaFunction(scope, `${constructId}Lambda`, parms);

    this.api = new AbstractRoleApi(scope, `${constructId}Api`, {
      cloudfrontDomain,
      lambdaFunction,
      userPool,
      role: Roles.RE_ADMIN,
      roleFullName: roleFullName(Roles.RE_ADMIN),
      description: `Api for all operations that are open to a ${roleFullName(Roles.RE_ADMIN)}`,
      bannerImage: 'client-admin.png',
      resourceId: Roles.RE_ADMIN,
      methods: [ 'POST', 'GET' ],
      scopes: [
        new ResourceServerScope({ 
          scopeName: 'invite-auth-ind', 
          scopeDescription: `Access to invite an RE ${roleFullName(Roles.RE_AUTH_IND)} to create an account`
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
  constructor(scope:Construct, constructId:string, parms:ApiConstructParms) {
    const context:IContext = scope.node.getContext('stack-parms');
    const { ACCOUNT, REGION, CONFIG, STACK_ID } = context;
    const { 
      userPool, cloudfrontDomain, landscape, exhibitFormsBucket, 
      disclosureRequestReminderLambdaArn, 
      handleStaleEntityVacancyLambdaArn,
      removeStaleInvitations
    } = parms;
    const { userPoolArn, userPoolId } = userPool;
    const prefix = `${STACK_ID}-${landscape}`;
    const scheduleGroupName = `${prefix}-scheduler-group`;
    
    super(scope, constructId, {
      runtime: Runtime.NODEJS_18_X,
      entry: 'lib/lambda/functions/re-admin/ReAdminUser.ts',
      // handler: 'handler',
      functionName: `${prefix}-${Roles.RE_ADMIN}-user`,
      memorySize: 1024,
      timeout: Duration.seconds(15),
      description: 'Function for all re admin user activity.',
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(scope, 'ReAdminRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        description: `Grants actions to the ${Roles.RE_ADMIN} lambda function to perform the related api tasks.`,
        inlinePolicies: {
          'EttReAdminSesPolicy': new PolicyDocument({
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
          'EttReAdminCognitoPolicy': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'cognito-idp:List*'  ],
                resources: [ '*' ],
                effect: Effect.ALLOW
              }),
              new PolicyStatement({
                actions: [ 'cognito-idp:*' ],
                resources: [ userPoolArn ],
                effect: Effect.ALLOW
              })
            ]
          }),
          'EttReAdminEventBridgePolicy': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'scheduler:DeleteSchedule', 'scheduler:CreateSchedule', 'scheduler:Get*' ],
                resources: [
                  `arn:aws:scheduler:${REGION}:${ACCOUNT}:schedule/${scheduleGroupName}/${prefix}-*`
                ],
                effect: Effect.ALLOW
              }),
              new PolicyStatement({
                actions: [ 'scheduler:List*' ],
                resources: [ '*' ],
                effect: Effect.ALLOW
              }),
              new PolicyStatement({
                actions: [ 'lambda:AddPermission' ],
                resources: [
                  `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${prefix}-${DelayedExecutions.DisclosureRequestReminder.coreName}`,
                  `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${prefix}-${DelayedExecutions.HandleStaleEntityVacancy.coreName}`
                ],
                effect: Effect.ALLOW
              }),
              new PolicyStatement({
                actions: [ 'iam:PassRole' ],
                resources: [ `arn:aws:iam::${ACCOUNT}:role/${prefix}-scheduler-role` ],
                effect: Effect.ALLOW,
                conditions: {                  
                  StringEquals: {
                    'iam:PassedToService': 'scheduler.amazonaws.com'
                  }
                }
              })
            ]
          }),
          'EttReAdminExhibitFormBucketPolicy': new PolicyDocument({
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
        REGION: REGION,
        CLOUDFRONT_DOMAIN: cloudfrontDomain,
        USERPOOL_ID: userPoolId,
        PREFIX: prefix,
        [ExhibitFormsBucketEnvironmentVariableName]: exhibitFormsBucket.bucketName,
        [DelayedExecutions.DisclosureRequestReminder.targetArnEnvVarName]: disclosureRequestReminderLambdaArn,
        [DelayedExecutions.HandleStaleEntityVacancy.targetArnEnvVarName]: handleStaleEntityVacancyLambdaArn,
        [DelayedExecutions.RemoveStaleInvitations.targetArnEnvVarName]: removeStaleInvitations,
        [Configurations.ENV_VAR_NAME]: new Configurations(CONFIG).getJson()
      }
    });
  }
}
