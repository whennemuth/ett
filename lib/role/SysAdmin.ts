import { ResourceServerScope } from "aws-cdk-lib/aws-cognito";
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { IContext } from '../../contexts/IContext';
import { AbstractFunction } from "../AbstractFunction";
import { ApiConstructParms } from "../Api";
import { Roles } from '../lambda/_lib/dao/entity';
import { AbstractRole, AbstractRoleApi } from "./AbstractRole";
import { Configurations } from "../lambda/_lib/config/Config";
import { ExhibitFormsBucketEnvironmentVariableName } from "../lambda/functions/consenting-person/BucketItemMetadata";
import { Duration } from "aws-cdk-lib";
import { DelayedExecutions } from "../DelayedExecution";

export class SysAdminApi extends AbstractRole {
  private api: AbstractRoleApi;
  protected roleFullName = 'System Administrator';
  
  constructor(scope: Construct, constructId: string, parms: ApiConstructParms) {

    super(scope, constructId);

    const { userPool, cloudfrontDomain, primaryDomain } = parms;
    const lambdaFunction = new LambdaFunction(scope, `${constructId}Lambda`, parms);

    this.api = new AbstractRoleApi(scope, `${constructId}Api`, {
      cloudfrontDomain,
      primaryDomain,
      lambdaFunction,
      userPool,
      role: Roles.SYS_ADMIN,
      roleFullName: 'System Administrator',
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
    const { ACCOUNT, CONFIG, REGION, TAGS: { Landscape:landscape }, STACK_ID } = context;
    const config = new Configurations(CONFIG);
    const { userPool, userPoolName, userPoolDomain, cloudfrontDomain, primaryDomain, redirectPath, exhibitFormsBucket, removeStaleInvitations, publicApiDomainNameEnvVar } = parms;
    const { userPoolArn, userPoolId } = userPool;
    const redirectUri = `https://${((primaryDomain || cloudfrontDomain) + '/' + redirectPath).replace('//', '/')}`;
    const prefix = `${STACK_ID}-${landscape}`;
    const scheduleGroupName = `${prefix}-scheduler-group`;

    super(scope, constructId, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
      timeout: Duration.seconds(15),
      entry: 'lib/lambda/functions/sys-admin/SysAdminUser.ts',
      // handler: 'handler',
      functionName: `${prefix}-${Roles.SYS_ADMIN}-user`,
      description: 'Function for all sys admin user activity.',
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(scope, 'SysAdminRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        description: `Grants actions to the ${Roles.SYS_ADMIN} lambda function to perform the related api tasks.`,
        inlinePolicies: {
          'EttSysAdminSesPolicy': new PolicyDocument({
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
          'EttSysAdminCognitoPolicy': new PolicyDocument({
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
          'EttSysAdminExhibitFormBucketPolicy': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 's3:*' ],
                resources: [ exhibitFormsBucket.bucketArn, `${exhibitFormsBucket.bucketArn}/*` ],
                effect: Effect.ALLOW
              })
            ]
          }),
          'EttSysAdminCloudformationPolicy': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'cloudformation:ListStacks' ],
                resources: [ '*' ],
                effect: Effect.ALLOW
              })
            ]
          }),
          'EttSysAdminEventBridgePolicy': new PolicyDocument({
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
        }
      }),
      environment: {
        REGION,
        PREFIX: prefix,
        [Configurations.ENV_VAR_NAME]: config.getJson(),
        USERPOOL_ID: userPoolId,
        USERPOOL_NAME: userPoolName,
        COGNITO_DOMAIN: userPoolDomain,
        CLOUDFRONT_DOMAIN: cloudfrontDomain,
        PRIMARY_DOMAIN: primaryDomain,
        REDIRECT_URI: redirectUri,
        [ExhibitFormsBucketEnvironmentVariableName]: exhibitFormsBucket.bucketName,
        [DelayedExecutions.RemoveStaleInvitations.targetArnEnvVarName]: removeStaleInvitations,
        [publicApiDomainNameEnvVar.name]: publicApiDomainNameEnvVar.value,        
      }
    });
  }
}