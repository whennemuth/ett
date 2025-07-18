import { ResourceServerScope } from "aws-cdk-lib/aws-cognito";
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { IContext } from "../../contexts/IContext";
import { AbstractFunction } from "../AbstractFunction";
import { ApiConstructParms } from "../Api";
import { roleFullName, Roles } from "../lambda/_lib/dao/entity";
import { AbstractRole, AbstractRoleApi } from "./AbstractRole";
import { Configurations } from "../lambda/_lib/config/Config";
import { DelayedExecutions } from "../DelayedExecution";
import { Duration } from "aws-cdk-lib";
import { ExhibitFormsBucketEnvironmentVariableName } from "../lambda/functions/consenting-person/BucketItemMetadata";


export class AuthorizedIndividualApi extends AbstractRole {
  private api: AbstractRoleApi

  constructor(scope: Construct, constructId: string, parms: ApiConstructParms) {

    super(scope, constructId);

    const { userPool, cloudfrontDomain, primaryDomain } = parms;
    const lambdaFunction = new LambdaFunction(scope, `${constructId}Lambda`, parms);

    this.api = new AbstractRoleApi(scope, `${constructId}Api`, {
      cloudfrontDomain,
      primaryDomain,
      lambdaFunction,
      userPool,
      role: Roles.RE_AUTH_IND,
      roleFullName: roleFullName(Roles.RE_AUTH_IND),
      description: `Api for all operations that are open to an ${roleFullName(Roles.RE_AUTH_IND)}`,
      bannerImage: 'client-auth-ind.png',
      resourceId: Roles.RE_AUTH_IND,
      methods: [ 'POST', 'GET' ],
      scopes: [
        new ResourceServerScope({ 
          scopeName: 'manage-applicants', 
          scopeDescription: `Access to inspect and correspond with ${roleFullName(Roles.CONSENTING_PERSON)}s`
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
    const { STACK_ID, ACCOUNT, REGION, CONFIG, TAGS: { Landscape } } = context;
    const scheduleGroupName = `${STACK_ID}-${Landscape}-scheduler-group`;
    const { 
      userPool, cloudfrontDomain, primaryDomain,landscape, exhibitFormsBucket, 
      disclosureRequestReminderLambdaArn, 
      handleStaleEntityVacancyLambdaArn,
      removeStaleInvitations,
      publicApiDomainNameEnvVar
    } = parms;
    const { userPoolId, userPoolArn } = userPool;
    const prefix = `${STACK_ID}-${landscape}`;
    super(scope, constructId, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
      timeout: Duration.seconds(15),
      entry: 'lib/lambda/functions/authorized-individual/AuthorizedIndividual.ts',
      // handler: 'handler',
      functionName: `${prefix}-${Roles.RE_AUTH_IND}-user`,
      description: `Function for all ${roleFullName(Roles.RE_AUTH_IND)} activity.`,
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
          'EttAuthIndEventBridgePolicy': new PolicyDocument({
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
        PRIMARY_DOMAIN: primaryDomain,
        USERPOOL_ID: userPoolId,
        PREFIX: prefix,
        [ExhibitFormsBucketEnvironmentVariableName]: exhibitFormsBucket.bucketName,
        [DelayedExecutions.DisclosureRequestReminder.targetArnEnvVarName]: disclosureRequestReminderLambdaArn,
        [DelayedExecutions.HandleStaleEntityVacancy.targetArnEnvVarName]: handleStaleEntityVacancyLambdaArn,
        [DelayedExecutions.RemoveStaleInvitations.targetArnEnvVarName]: removeStaleInvitations,
        [publicApiDomainNameEnvVar.name]: publicApiDomainNameEnvVar.value,
        [Configurations.ENV_VAR_NAME]: new Configurations(CONFIG).getJson()
      }
    });
  }
}