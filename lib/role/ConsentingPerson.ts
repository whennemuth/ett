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
    const { userPool, cloudfrontDomain } = parms;
    const { userPoolArn, userPoolId } = userPool;
    super(scope, constructId, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
      entry: 'lib/lambda/functions/consenting-person/ConsentingPerson.ts',
      // handler: 'handler',
      functionName: `Ett${constructId}`,
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
                  `arn:aws:ses:${context.REGION}:${context.ACCOUNT}:identity/*`
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
          })
        }
      }),
      environment: {
        REGION: scope.node.getContext('stack-parms').REGION,
        CLOUDFRONT_DOMAIN: cloudfrontDomain,
        USERPOOL_ID: userPoolId,
        [Configurations.ENV_VAR_NAME]: new Configurations(context.CONFIG).getJson()
      }
    });
  }
}
