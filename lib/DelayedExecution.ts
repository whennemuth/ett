import { Construct } from "constructs";
import { IContext } from "../contexts/IContext";
import { AbstractFunction } from "./AbstractFunction";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Configurations } from "./lambda/_lib/config/Config";
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { TableBaseNames } from "./DynamoDb";
import { Queue } from "aws-cdk-lib/aws-sqs";

export const EXHIBIT_FORM_DB_PURGE = 'purge-exhibit-form-from-database';

export type DelayedExecutionLambdaParms = {
  cloudfrontDomain: string,
  exhibitFormsBucket: Bucket
}
export class DelayedExecutionLambdas extends Construct {
  private scope:Construct;
  private constructId:string;
  private context:IContext;
  private parms:DelayedExecutionLambdaParms;
  private _databaseExhibitFormPurgeLambda:AbstractFunction;

  constructor(scope:Construct, constructId:string, parms:DelayedExecutionLambdaParms) {
    super(scope, constructId);

    this.scope = scope;
    this.context = scope.node.getContext('stack-parms');
    this.constructId = constructId;
    this.parms = parms;

    this.createDatabaseExhibitFormPurgeLambda();
  }

  private createDatabaseExhibitFormPurgeLambda = () => {
    const { scope } = this;
    const { constructId, parms: { cloudfrontDomain }, context: { REGION, ACCOUNT, CONFIG, TAGS: { Landscape:landscape }, STACK_ID } } = this;
    const baseId = `${constructId}DatabaseExhbitFormPurge`;
    const prefix = `${STACK_ID}-${landscape}`
    const functionName = `${prefix}-${EXHIBIT_FORM_DB_PURGE}`;
    const description = 'Function for removing exhibit forms from consenter records';

    // Create the lambda function
    this._databaseExhibitFormPurgeLambda = new class extends AbstractFunction { }(this, baseId, {
      runtime: Runtime.NODEJS_18_X,
      // memorySize: 1024,
      entry: 'lib/lambda/functions/delayed-execution/PurgeExhibitFormFromDatabase.ts',
      // handler: 'handler',
      functionName: `${functionName}`,
      description,
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(scope, 'DatabaseExhibitFormPurgeRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        description: 'Grants access to dynamodb for updates to consenters',
        inlinePolicies: {
          [`${functionName}--db-policy`]: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'dynamodb:UpdateItem', 'dynamodb:Query', 'dynamodb:GetItem' ],
                resources: [
                  `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${prefix}-${TableBaseNames.CONSENTERS}`,
                  `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${prefix}-${TableBaseNames.CONSENTERS}/index/*`
                ],
                effect: Effect.ALLOW
              })
            ]
          }),
          [`${functionName}-eventbridge-policy`]: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'events:DeleteRule', 'events:RemoveTargets' ],
                resources: [
                  `arn:aws:events:${REGION}:${ACCOUNT}:rule/${prefix}-*`
                ],
                effect: Effect.ALLOW
              })
            ]
          })
        }
      }),
      environment: {
        REGION,
        CLOUDFRONT_DOMAIN: cloudfrontDomain,
        PREFIX: prefix,
        [Configurations.ENV_VAR_NAME]: new Configurations(CONFIG).getJson()
      }
    });

    // Grant event bridge permission to invoke the lambda function.
    this._databaseExhibitFormPurgeLambda.addPermission(`${functionName}-invoke-permission`, {
      principal: new ServicePrincipal('events.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: `arn:aws:events:${REGION}:${ACCOUNT}:rule/${prefix}-*`
    })
  }

  public get databaseExhibitFormPurgeLambda(): AbstractFunction {
    return this._databaseExhibitFormPurgeLambda;
  }
}
