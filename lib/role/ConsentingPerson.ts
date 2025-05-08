import { ResourceServerScope } from "aws-cdk-lib/aws-cognito";
import { Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { AbstractFunction } from "../AbstractFunction";
import { ApiConstructParms } from "../Api";
import { roleFullName, Roles } from "../lambda/_lib/dao/entity";
import { AbstractRole, AbstractRoleApi } from "./AbstractRole";
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { IContext } from "../../contexts/IContext";
import { Configurations } from "../lambda/_lib/config/Config";
import { DelayedExecutions } from "../DelayedExecution";
import { Duration } from "aws-cdk-lib";
import { ExhibitFormsBucketEnvironmentVariableName } from "../lambda/functions/consenting-person/BucketItemMetadata";

export class ConsentingPersonApi extends AbstractRole {
  private api: AbstractRoleApi

  constructor(scope: Construct, constructId: string, parms: ApiConstructParms) {

    super(scope, constructId);

    const { userPool, cloudfrontDomain } = parms;
    const lambdaFunction = new LambdaFunction(scope, `${constructId}Lambda`, parms);

    this.api = new AbstractRoleApi(scope, `${constructId}Api`, {
      cloudfrontDomain,
      lambdaFunction,
      userPool,
      role: Roles.CONSENTING_PERSON,
      roleFullName: roleFullName(Roles.CONSENTING_PERSON),
      description: `Api for all operations that are open to a ${roleFullName(Roles.CONSENTING_PERSON)}`,
      bannerImage: 'client-consenting.png',
      resourceId: Roles.CONSENTING_PERSON,
      methods: [ 'POST', 'GET' ],
      scopes: [
        new ResourceServerScope({ 
          scopeName: 'submit-consent', 
          scopeDescription: 'Access submit consent forms'
        }),
        new ResourceServerScope({
          scopeName: 'submit-exhibits',
          scopeDescription: 'Access to submit exhibit forms'
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
    const { ACCOUNT, REGION, CONFIG, STACK_ID } = context;
    const { userPool, cloudfrontDomain, landscape, exhibitFormsBucket, 
      databaseExhibitFormPurgeLambdaArn, disclosureRequestReminderLambdaArn, bucketExhibitFormPurgeLambdaArn,
      publicApiDomainNameEnvVar
    } = parms;
    const { userPoolArn, userPoolId } = userPool;
    const prefix = `${STACK_ID}-${landscape}`;
    const scheduleGroupName = `${prefix}-scheduler-group`;
    const { bucketArn } = exhibitFormsBucket;
    super(scope, constructId, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
      timeout: Duration.seconds(15),
      entry: 'lib/lambda/functions/consenting-person/ConsentingPerson.ts',
      // handler: 'handler',
      functionName: `${prefix}-${Roles.CONSENTING_PERSON}-user`,
      description: `Function for all ${roleFullName(Roles.CONSENTING_PERSON)}s activity.`,
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(scope, 'ConsentingPersonRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        description: `Grants actions to the ${Roles.CONSENTING_PERSON} lambda function to perform the related api tasks.`,
        inlinePolicies: {
          'EttConsentingPersonSesPolicy': new PolicyDocument({
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
          'EttConsentingPersonCognitoPolicy': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'cognito-idp:*' ],
                resources: [ userPoolArn ],
                effect: Effect.ALLOW
              }),
              new PolicyStatement({
                actions: [ 'cognito-idp:List*' ],
                resources: ['*'],
                effect: Effect.ALLOW
              }),
            ]
          }),
          'EttConsentingPersonEventBridgePolicy': new PolicyDocument({
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
                  `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${prefix}-${DelayedExecutions.ExhibitFormDbPurge.coreName}`
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
          'EttConsentingPersonS3Policy': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 's3:*' ],
                resources: [ bucketArn, `${bucketArn}/*` ],
                effect: Effect.ALLOW
              })
            ]
          })
        }
      }),
      environment: {
        REGION: scope.node.getContext('stack-parms').REGION,
        CLOUDFRONT_DOMAIN: cloudfrontDomain,
        USERPOOL_ID: userPoolId,
        PREFIX: prefix,
        [ExhibitFormsBucketEnvironmentVariableName]: exhibitFormsBucket.bucketName,
        [DelayedExecutions.ExhibitFormDbPurge.targetArnEnvVarName]: databaseExhibitFormPurgeLambdaArn,
        [DelayedExecutions.ExhibitFormBucketPurge.targetArnEnvVarName]: bucketExhibitFormPurgeLambdaArn,
        [DelayedExecutions.DisclosureRequestReminder.targetArnEnvVarName]: disclosureRequestReminderLambdaArn,
        [publicApiDomainNameEnvVar.name]: publicApiDomainNameEnvVar.value,
        [Configurations.ENV_VAR_NAME]: new Configurations(CONFIG).getJson()
      }
    });
  }
}
