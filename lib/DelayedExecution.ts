import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { IContext } from "../contexts/IContext";
import { AbstractFunction } from "./AbstractFunction";
import { TableBaseNames } from "./DynamoDb";
import { Configurations } from "./lambda/_lib/config/Config";
import { ExhibitFormsBucketEnvironmentVariableName } from "./lambda/functions/consenting-person/BucketItemMetadata";
import { Duration } from "aws-cdk-lib";
import { ScheduleGroup } from "aws-cdk-lib/aws-scheduler";

export type DelayedExecutionNames = {
  coreName: string, targetArnEnvVarName: string
}
export const DelayedExecutions = {
  ExhibitFormDbPurge: { 
    coreName: 'purge-exhibit-forms-from-database', 
    targetArnEnvVarName: 'EXHIBIT_FORM_DATABASE_PURGE_FUNCTION_ARN' 
  } as DelayedExecutionNames,
  DisclosureRequestReminder: {
    coreName: 'disclosure-request-reminder',
    targetArnEnvVarName: 'DISCLOSURE_REQUEST_REMINDER_FUNCTION_ARN'
  } as DelayedExecutionNames,
  ExhibitFormBucketPurge: {
    coreName: 'purge-exhibit-forms-from-bucket',
    targetArnEnvVarName: 'EXHIBIT_FORM_BUCKET_PURGE_FUNCTION_ARN'
  } as DelayedExecutionNames,
  HandleStaleEntityVacancy: {
    coreName: 'handle-stale-entity-vacancy',
    targetArnEnvVarName: 'HANDLE_STALE_ENTITY_VACANCY_ARN'
  } as DelayedExecutionNames,
  ConsenterPurge: {
    coreName: 'purge-consenter',
    targetArnEnvVarName: 'PURGE_CONSENTER_FUNCTION_ARN'
  } as DelayedExecutionNames,
  RemoveStaleInvitations: {
    coreName: 'remove-stale-invitations',
    targetArnEnvVarName: 'REMOVE_STALE_INVITATIONS_FUNCTION_ARN'
  } as DelayedExecutionNames
}

export type DelayedExecutionLambdaParms = {
  cloudfrontDomain: string,
  exhibitFormsBucket: Bucket,
  userPoolId: string
}
export class DelayedExecutionLambdas extends Construct {
  private scope:Construct;
  private constructId:string;
  private context:IContext;
  private parms:DelayedExecutionLambdaParms;
  private scheduleGroupName:string;
  private _databaseExhibitFormPurgeLambda:AbstractFunction;
  private _disclosureRequestReminderLambda:AbstractFunction;
  private _bucketExhibitFormPurgeLambda:AbstractFunction;
  private _handleStaleEntityVacancyLambda:AbstractFunction;
  private _consenterPurgeLambda:AbstractFunction;
  private _removeStaleInvitationsLambda:AbstractFunction;

  constructor(scope:Construct, constructId:string, parms:DelayedExecutionLambdaParms) {
    super(scope, constructId);

    this.scope = scope;
    this.context = scope.node.getContext('stack-parms');
    this.constructId = constructId;
    this.parms = parms;
    const { context: { STACK_ID, TAGS: { Landscape }}} = this;
    this.scheduleGroupName = `${STACK_ID}-${Landscape}-scheduler-group`;

    this.createDatabaseExhibitFormPurgeLambda();

    this.createDisclosureRequestReminderLambda();

    this.createBucketExhibitFormPurgeLambda();

    this.createHandleStaleEntityVacancyLambda();

    this.createConsenterPurgeLambda();

    this.createStaleInvitationsLambda();

    this.createEventSchedulerGroup();

    this.createSchedulesRole();
  }

  private createDatabaseExhibitFormPurgeLambda = () => {
    const { 
      constructId, parms: { cloudfrontDomain }, scheduleGroupName,
      context: { REGION, ACCOUNT, CONFIG, TAGS: { Landscape:landscape }, STACK_ID } 
    } = this;
    const baseId = `${constructId}DatabaseExhibitFormPurge`;
    const prefix = `${STACK_ID}-${landscape}`
    const functionName = `${prefix}-${DelayedExecutions.ExhibitFormDbPurge.coreName}`;
    const description = 'Function for removing exhibit forms from consenter records';

    // Create the lambda function
    this._databaseExhibitFormPurgeLambda = new class extends AbstractFunction { }(this, baseId, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 256,
      timeout: Duration.seconds(5),
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
          [`${functionName}-scheduler-policy`]: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'scheduler:DeleteSchedule' ],
                resources: [
                  `arn:aws:scheduler:${REGION}:${ACCOUNT}:schedule/${scheduleGroupName}/${prefix}-*`
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
  }

  private createDisclosureRequestReminderLambda = () => {
    const { 
      constructId, parms: { cloudfrontDomain, exhibitFormsBucket: { bucketArn, bucketName } }, 
      context: { REGION, ACCOUNT, CONFIG, TAGS: { Landscape:landscape }, STACK_ID }, scheduleGroupName
    } = this;
    const baseId = `${constructId}DisclosureRequestReminder`;
    const prefix = `${STACK_ID}-${landscape}`
    const functionName = `${prefix}-${DelayedExecutions.DisclosureRequestReminder.coreName}`;
    const description = 'Function for issuing disclosure reminder emails to affiliates, triggered by event bridge';

    // Create the lambda function
    this._disclosureRequestReminderLambda = new class extends AbstractFunction { }(this, baseId, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 512,
      timeout: Duration.seconds(5),
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
          [`${functionName}-scheduler-policy`]: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'scheduler:DeleteSchedule' ],
                resources: [
                  `arn:aws:scheduler:${REGION}:${ACCOUNT}:schedule/${scheduleGroupName}/${prefix}-*`
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
        [ExhibitFormsBucketEnvironmentVariableName]: bucketName,
        [Configurations.ENV_VAR_NAME]: new Configurations(CONFIG).getJson()
      }
    });
  }

  private createBucketExhibitFormPurgeLambda = () => {
    const { 
      constructId, parms: { cloudfrontDomain, exhibitFormsBucket: { bucketArn, bucketName } }, 
      context: { REGION, ACCOUNT, CONFIG, TAGS: { Landscape:landscape }, STACK_ID }, scheduleGroupName 
    } = this;
    const baseId = `${constructId}BucketPurge`;
    const prefix = `${STACK_ID}-${landscape}`
    const functionName = `${prefix}-${DelayedExecutions.ExhibitFormBucketPurge.coreName}`;
    const description = 'Function for removing exhibit forms from consenter records';
    
    this._bucketExhibitFormPurgeLambda = new class extends AbstractFunction { }(this, baseId, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 256,
      timeout: Duration.seconds(5),
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
          [`${functionName}-scheduler-policy`]: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'scheduler:DeleteSchedule' ],
                resources: [
                  `arn:aws:scheduler:${REGION}:${ACCOUNT}:schedule/${scheduleGroupName}/${prefix}-*`
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
        [ExhibitFormsBucketEnvironmentVariableName]: bucketName,
        [Configurations.ENV_VAR_NAME]: new Configurations(CONFIG).getJson()
      }
    });
  }

  private createHandleStaleEntityVacancyLambda = () => {
    const { constructId, parms: { 
      cloudfrontDomain, 
      userPoolId, 
      exhibitFormsBucket: { bucketArn, bucketName } }, scheduleGroupName,
      context: { REGION, ACCOUNT, CONFIG, TAGS: { Landscape:landscape }, STACK_ID } 
    } = this;
    const baseId = `${constructId}HandleStaleEntityVacancy`;
    const prefix = `${STACK_ID}-${landscape}`
    const functionName = `${prefix}-${DelayedExecutions.HandleStaleEntityVacancy.coreName}`;
    const description = 'Function for handling entity termination for vacancies in entity roles that have lasted too long';

    // Configure this with extra time for the lambda to run - If there are lots of event bridge schedules to delete, the schedule detail lookups could take a while.
    this._handleStaleEntityVacancyLambda = new class extends AbstractFunction { }(this, baseId, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 256,
      timeout: Duration.minutes(5),
      entry: 'lib/lambda/functions/delayed-execution/HandleStaleEntityVacancy.ts',
      // handler: 'handler',
      functionName,
      description,
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(this, 'HandleStaleEntityVacancyRole', {
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
          [`${functionName}-scheduler-policy`]: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'scheduler:DeleteSchedule', 'scheduler:GetSchedule' ],
                resources: [
                  `arn:aws:scheduler:${REGION}:${ACCOUNT}:schedule/${scheduleGroupName}/${prefix}-*`
                ],
                effect: Effect.ALLOW
              }),
              new PolicyStatement({
                actions: [ 'scheduler:List*' ],
                resources: [ '*' ],
                effect: Effect.ALLOW
              })
            ]
          }),
          [`${functionName}-delete-user-from-pool`]: new PolicyDocument({
            statements: [ new PolicyStatement({
              actions: [
                'cognito-idp:AdminDeleteUser',
              ],
              resources: [ `arn:aws:cognito-idp:${REGION}:${ACCOUNT}:userpool/${REGION}_*` ],
              effect: Effect.ALLOW
            })]
          }),
        }
      }),
      environment: {
        REGION,
        CLOUDFRONT_DOMAIN: cloudfrontDomain,
        USERPOOL_ID: userPoolId,
        PREFIX: prefix,
        [ExhibitFormsBucketEnvironmentVariableName]: bucketName,
        [Configurations.ENV_VAR_NAME]: new Configurations(CONFIG).getJson()
      }
    });
  }

  private createConsenterPurgeLambda = () => {
    const { constructId, parms: { cloudfrontDomain, userPoolId }, scheduleGroupName,
      context: { REGION, ACCOUNT, CONFIG, TAGS: { Landscape:landscape }, STACK_ID } 
    } = this;
    const baseId = `${constructId}PurgeConsenter`;
    const prefix = `${STACK_ID}-${landscape}`
    const functionName = `${prefix}-${DelayedExecutions.ConsenterPurge.coreName}`;
    const description = 'Function for purging consenter records that have had no related consent submitted in the required time';
    
    this._consenterPurgeLambda = new class extends AbstractFunction { }(this, baseId, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 256,
      timeout: Duration.seconds(15),
      entry: 'lib/lambda/functions/delayed-execution/PurgeConsenter.ts',
      // handler: 'handler',
      functionName,
      description,
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(this, 'PurgeConsenterRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        description: 'Grants access to dynamodb, cognito, ses, and event-bridge',
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
          [`${functionName}-scheduler-policy`]: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'scheduler:DeleteSchedule' ],
                resources: [
                  `arn:aws:scheduler:${REGION}:${ACCOUNT}:schedule/${scheduleGroupName}/${prefix}-*`
                ],
                effect: Effect.ALLOW
              })
            ]
          }),
          [`${functionName}-delete-user-from-pool`]: new PolicyDocument({
            statements: [ new PolicyStatement({
              actions: [
                'cognito-idp:AdminDeleteUser', 'cognito-idp:AdminGetUser'
              ],
              resources: [ `arn:aws:cognito-idp:${REGION}:${ACCOUNT}:userpool/${REGION}_*` ],
              effect: Effect.ALLOW
            })]
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
        }
      }),
      environment: {
        REGION,
        CLOUDFRONT_DOMAIN: cloudfrontDomain,
        USERPOOL_ID: userPoolId,
        PREFIX: prefix,
        [Configurations.ENV_VAR_NAME]: new Configurations(CONFIG).getJson()
      }
    });
  }

  private createStaleInvitationsLambda = () => {
    const { constructId, parms: { cloudfrontDomain, userPoolId }, scheduleGroupName,
      context: { REGION, ACCOUNT, CONFIG, TAGS: { Landscape:landscape }, STACK_ID }
    } = this;
    const baseId = `${constructId}RemoveStaleInvitations`;
    const prefix = `${STACK_ID}-${landscape}`
    const functionName = `${prefix}-${DelayedExecutions.RemoveStaleInvitations.coreName}`;
    const description = 'Function for removing stale invitations that have not been accepted in the required time';

    this._removeStaleInvitationsLambda = new class extends AbstractFunction { }(this, baseId, {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 256,
      timeout: Duration.seconds(15),
      entry: 'lib/lambda/functions/delayed-execution/RemoveStaleInvitations.ts',
      // handler: 'handler',
      functionName,
      description,
      cleanup: true,
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(this, 'RemoveStaleInvitationsRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        description: 'Grants access to dynamodb, cognito, and event-bridge',
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
          [`${functionName}-scheduler-policy`]: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'scheduler:*' ],
                resources: [
                  `arn:aws:scheduler:${REGION}:${ACCOUNT}:schedule/${scheduleGroupName}/${prefix}-*`
                ],
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
        }
      }),
      environment: {
        REGION,
        CLOUDFRONT_DOMAIN: cloudfrontDomain,
        USERPOOL_ID: userPoolId,
        PREFIX: prefix,
        [Configurations.ENV_VAR_NAME]: new Configurations(CONFIG).getJson()
      }
    });
  }

  private createEventSchedulerGroup = () => {
    const { context: { TAGS: { Landscape:landscape }, STACK_ID }, constructId } = this;
    const prefix = `${STACK_ID}-${landscape}`;
    const baseId = `${constructId}SchedulerGroup`;
    new ScheduleGroup(this, baseId, { scheduleGroupName: `${prefix}-scheduler-group` });
  }

  private createSchedulesRole = () => {
    const { context: { TAGS: { Landscape:landscape }, STACK_ID, REGION, ACCOUNT }, constructId } = this;
    const prefix = `${STACK_ID}-${landscape}`;
    new Role(this, 'EventBridgeSchedulerRole', {
      roleName: `${prefix}-scheduler-role`,
      assumedBy: new ServicePrincipal('scheduler.amazonaws.com'), // Trust policy for EventBridge Scheduler
      description: 'Role for EventBridge Scheduler to invoke ETT Lambda functions',
      inlinePolicies: {
        'EventBridgeSchedulerPolicy': new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ['lambda:InvokeFunction'],
              resources: [
                `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${prefix}-*`
              ],
              effect: Effect.ALLOW
            })
          ]
        })
      }
    });
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

  public get handleStaleEntityVacancyLambda():AbstractFunction {
    return this._handleStaleEntityVacancyLambda;
  }

  public get consenterPurgeLambda():AbstractFunction {
    return this._consenterPurgeLambda;
  }

  public get removeStaleInvitationsLambda():AbstractFunction {
    return this._removeStaleInvitationsLambda;
  }
}
