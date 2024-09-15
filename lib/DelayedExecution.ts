import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { IContext } from "../contexts/IContext";
import { AbstractFunction } from "./AbstractFunction";
import { TableBaseNames } from "./DynamoDb";
import { Configurations } from "./lambda/_lib/config/Config";

export const EXHIBIT_FORM_DB_PURGE = 'purge-exhibit-forms-from-database';
export const DISCLOSURE_REQUEST_REMINDER = 'disclosure-request-reminder';
export const EXHIBIT_FORM_S3_PURGE = 'purge-exhibit-forms-from-bucket';

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
  private _disclosureRequestReminderLambda:AbstractFunction;
  private _bucketExhibitFormPurgeLambda:AbstractFunction;

  constructor(scope:Construct, constructId:string, parms:DelayedExecutionLambdaParms) {
    super(scope, constructId);

    this.scope = scope;
    this.context = scope.node.getContext('stack-parms');
    this.constructId = constructId;
    this.parms = parms;

    this.createDatabaseExhibitFormPurgeLambda();

    this.createDisclosureRequestReminderLambda();

    this.createBucketExhibitFormPurgeLambda();
  }

  private createDatabaseExhibitFormPurgeLambda = () => {
    const { scope } = this;
    const { constructId, parms: { cloudfrontDomain }, context: { REGION, ACCOUNT, CONFIG, TAGS: { Landscape:landscape }, STACK_ID } } = this;
    const baseId = `${constructId}DatabaseExhibitFormPurge`;
    const prefix = `${STACK_ID}-${landscape}`
    const functionName = `${prefix}-${EXHIBIT_FORM_DB_PURGE}`;
    const description = 'Function for removing exhibit forms from consenter records';

    // Create the lambda function
    this._databaseExhibitFormPurgeLambda = new class extends AbstractFunction { }(this, baseId, {
      runtime: Runtime.NODEJS_18_X,
      // memorySize: 1024,
      entry: 'lib/lambda/functions/delayed-execution/PurgeExhibitFormFromDatabase.ts',
      // handler: 'handler',
      functionName,
      description,
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(this, `DatabaseExhibitFormPurgeRole`, {
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
    });
  }

  private createDisclosureRequestReminderLambda = () => {
    const { scope } = this;
    const { constructId, parms: { cloudfrontDomain, exhibitFormsBucket: { bucketArn, bucketName } }, context: { REGION, ACCOUNT, CONFIG, TAGS: { Landscape:landscape }, STACK_ID } } = this;
    const baseId = `${constructId}DisclosureRequestReminder`;
    const prefix = `${STACK_ID}-${landscape}`
    const functionName = `${prefix}-${DISCLOSURE_REQUEST_REMINDER}`;
    const description = 'Function for issuing disclosure reminder emails to affiliates, triggered by event bridge';

    // Create the lambda function
    this._disclosureRequestReminderLambda = new class extends AbstractFunction { }(this, baseId, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 512,
      entry: 'lib/lambda/functions/delayed-execution/SendDisclosureRequestReminder.ts',
      // handler: 'handler',
      functionName: `${functionName}`,
      description,
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(this, `DisclosureRequestReminderRole`, {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        description: 'Grants access to dynamodb, s3, ses, and event-bridge',
        inlinePolicies: {
          [`${functionName}--db-policy`]: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:GetItem' ],
                resources: [
                  `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${prefix}-*`,
                  `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${prefix}-*/index/*`
                ],
                effect: Effect.ALLOW
              })
            ]
          }),
          [`${functionName}-s3-policy`]: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 's3:*' ],
                resources: [ bucketArn, `${bucketArn}/*` ],
                effect: Effect.ALLOW
              })
            ]
          }),
          [`${functionName}-ses-policy`]: new PolicyDocument({
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
        EXHIBIT_FORMS_BUCKET_NAME: bucketName,
        [Configurations.ENV_VAR_NAME]: new Configurations(CONFIG).getJson()
      }
    });

    // Grant event bridge permission to invoke the lambda function.
    this._disclosureRequestReminderLambda.addPermission(`${functionName}-invoke-permission`, {
      principal: new ServicePrincipal('events.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: `arn:aws:events:${REGION}:${ACCOUNT}:rule/${prefix}-*`
    })
  }

  private createBucketExhibitFormPurgeLambda = () => {
    const { scope } = this;
    const { constructId, parms: { cloudfrontDomain, exhibitFormsBucket: { bucketArn, bucketName } }, context: { REGION, ACCOUNT, CONFIG, TAGS: { Landscape:landscape }, STACK_ID } } = this;
    const baseId = `${constructId}BucketPurge`;
    const prefix = `${STACK_ID}-${landscape}`
    const functionName = `${prefix}-${EXHIBIT_FORM_S3_PURGE}`;
    const description = 'Function for removing exhibit forms from consenter records';
    
    this._bucketExhibitFormPurgeLambda = new class extends AbstractFunction { }(this, baseId, {
      runtime: Runtime.NODEJS_18_X,
      // memorySize: 1024,
      entry: 'lib/lambda/functions/delayed-execution/PurgeExhibitFormFromBucket.ts',
      // handler: 'handler',
      functionName,
      description,
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(this, 'BucketPurgeRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        description: 'Grants access to dynamodb, s3, ses, and event-bridge',
        inlinePolicies: {
          [`${functionName}--db-policy`]: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'dynamodb:DeleteItem', 'dynamodb:Query', 'dynamodb:GetItem' ],
                resources: [
                  `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${prefix}-*`,
                  `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${prefix}-*/index/*`
                ],
                effect: Effect.ALLOW
              })
            ]
          }),
          [`${functionName}-s3-policy`]: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 's3:*' ],
                resources: [ bucketArn, `${bucketArn}/*` ],
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
        EXHIBIT_FORMS_BUCKET_NAME: bucketName,
        [Configurations.ENV_VAR_NAME]: new Configurations(CONFIG).getJson()
      }
    });

    // Grant event bridge permission to invoke the lambda function.
    this._bucketExhibitFormPurgeLambda.addPermission(`${functionName}-invoke-permission`, {
      principal: new ServicePrincipal('events.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: `arn:aws:events:${REGION}:${ACCOUNT}:rule/${prefix}-*`
    })
  }

  public get databaseExhibitFormPurgeLambda(): AbstractFunction {
    return this._databaseExhibitFormPurgeLambda;
  }

  public get disclosureRequestReminderLambda(): AbstractFunction {
    return this._disclosureRequestReminderLambda;
  }

  public get bucketExhibitFormPurgeLambda(): AbstractFunction {
    return this._bucketExhibitFormPurgeLambda;
  }
}
