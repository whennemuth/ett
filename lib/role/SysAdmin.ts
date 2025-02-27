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

    const { userPool, cloudfrontDomain } = parms;
    const lambdaFunction = new LambdaFunction(scope, `${constructId}Lambda`, parms);

    this.api = new AbstractRoleApi(scope, `${constructId}Api`, {
      cloudfrontDomain,
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
    const { userPool, userPoolName, userPoolDomain, cloudfrontDomain, redirectPath, exhibitFormsBucket, removeStaleInvitations } = parms;
    const { userPoolArn, userPoolId } = userPool;
    const redirectUri = `https://${(cloudfrontDomain + '/' + redirectPath).replace('//', '/')}`;
    const prefix = `${STACK_ID}-${landscape}`;

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
                actions: [  'cognito-idp:List*'  ],
                resources: [ '*' ],
                effect: Effect.ALLOW
              }),
              new PolicyStatement({
                actions: [  
                  'cognito-idp:AdminGet*', 
                  'cognito-idp:AdminCreateUser',
                  'cognito-idp:AdminDeleteUser', 
                  'cognito-idp:AdminSetUserPassword' 
                ],
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
        REDIRECT_URI: redirectUri,
        [ExhibitFormsBucketEnvironmentVariableName]: exhibitFormsBucket.bucketName,
        [DelayedExecutions.RemoveStaleInvitations.targetArnEnvVarName]: removeStaleInvitations,        
      }
    });
  }
}