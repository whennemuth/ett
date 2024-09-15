import { ResourceServerScope } from "aws-cdk-lib/aws-cognito";
import { Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { AbstractFunction } from "../AbstractFunction";
import { ApiConstructParms } from "../Api";
import { Roles } from "../lambda/_lib/dao/entity";
import { AbstractRole, AbstractRoleApi } from "./AbstractRole";
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { IContext } from "../../contexts/IContext";
import { Configurations } from "../lambda/_lib/config/Config";
import { EXHIBIT_FORM_DB_PURGE } from "../DelayedExecution";
import { Duration } from "aws-cdk-lib";

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
      roleFullName: 'Consenting Person',
      description: 'Api for all operations that are open to a consenting person',
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
    const { userPool, cloudfrontDomain, landscape, exhibitFormsBucket, databaseExhibitFormPurgeLambdaArn, bucketExhibitFormPurgeLambdaArn } = parms;
    const { userPoolArn, userPoolId } = userPool;
    const prefix = `${STACK_ID}-${landscape}`
    super(scope, constructId, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
      timeout: Duration.seconds(15),
      entry: 'lib/lambda/functions/consenting-person/ConsentingPerson.ts',
      // handler: 'handler',
      functionName: `${prefix}-${Roles.CONSENTING_PERSON}-user`,
      description: 'Function for all consenting persons activity.',
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
                actions: [  'cognito-idp:List*'  ],
                resources: [ '*' ],
                effect: Effect.ALLOW
              })
            ]
          }),
          'EttConsentingPersonEventBridgePolicy': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'events:PutRule', 'events:PutTargets' ],
                resources: [
                  `arn:aws:events:${REGION}:${ACCOUNT}:rule/*`
                ],
                effect: Effect.ALLOW
              }),
              new PolicyStatement({
                actions: [ 'lambda:AddPermission' ],
                resources: [
                  `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${prefix}-${EXHIBIT_FORM_DB_PURGE}`
                ],
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
        EXHIBIT_FORMS_BUCKET_NAME: exhibitFormsBucket.bucketName,
        EXHIBIT_FORM_DATABASE_PURGE_FUNCTION_ARN: databaseExhibitFormPurgeLambdaArn,
        EXHIBIT_FORM_BUCKET_PURGE_FUNCTION_ARN: bucketExhibitFormPurgeLambdaArn,
        [Configurations.ENV_VAR_NAME]: new Configurations(CONFIG).getJson()
      }
    });
  }
}
