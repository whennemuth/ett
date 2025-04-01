import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { AccountRecovery, UserPool, UserPoolDomain } from 'aws-cdk-lib/aws-cognito';
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { IContext } from '../contexts/IContext';
import { AbstractFunction } from './AbstractFunction';
import { DelayedExecutions } from './DelayedExecution';
import { DynamoDbConstruct, TableBaseNames } from './DynamoDb';
import { Configurations } from './lambda/_lib/config/Config';
import { ExhibitFormsBucketEnvironmentVariableName } from './lambda/functions/consenting-person/BucketItemMetadata';
import path = require('path');

export type CognitoConstructParms = {
  scope:Construct, 
  constructId:string, 
  exhibitFormsBucket:Bucket, 
  handleStaleEntityVacancyLambdaArn:string,
  cloudfrontDomain:string
}
export class CognitoConstruct extends Construct {

  private constructId: string;
  private context: IContext;
  private userPool: UserPool;
  private userPoolDomain: UserPoolDomain;
  private userPoolName: string;
  private landscape: string;
  private exhibitFormsBucket:Bucket;
  private handleStaleEntityVacancyLambdaArn:string;
  private prefix:string;
  private cloudfrontDomain:string;
  private scheduleGroupName:string;

  constructor(parms:CognitoConstructParms) {
    const { scope, constructId, exhibitFormsBucket, handleStaleEntityVacancyLambdaArn, cloudfrontDomain } = parms;

    super(scope, constructId);

    this.constructId = constructId;
    this.context = scope.node.getContext('stack-parms');
    const { TAGS: { Landscape }, STACK_ID } = this.context;
    this.landscape = Landscape;
    this.prefix = `${STACK_ID}-${Landscape}`;
    this.scheduleGroupName = `${this.prefix}-scheduler-group`;
    this.exhibitFormsBucket = exhibitFormsBucket;
    this.handleStaleEntityVacancyLambdaArn = handleStaleEntityVacancyLambdaArn;
    this.userPoolName = `${this.prefix}-${this.constructId.toLowerCase()}-userpool`;
    this.cloudfrontDomain = cloudfrontDomain;
    this.buildResources();
  }

  buildResources(): void {
    const { 
      prefix, context: { REGION, ACCOUNT, CONFIG:config, STACK_ID:stackId }, scheduleGroupName,
      context: { CONSENTING_PERSON_PATH, RE_ADMIN_PATH, RE_AUTH_IND_PATH, TERMS_OF_USE_PATH },
      constructId, landscape, exhibitFormsBucket, handleStaleEntityVacancyLambdaArn, cloudfrontDomain
    } = this;
    const { CONFIG, CONSENTERS, ENTITIES, INVITATIONS, USERS } = TableBaseNames;
    const { getTableName } = DynamoDbConstruct;

    const dynamodbResources = [
      `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${getTableName(USERS)}`,
      `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${getTableName(USERS)}/*`,
      `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${getTableName(INVITATIONS)}`,
      `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${getTableName(INVITATIONS)}/*`,
      `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${getTableName(ENTITIES)}`,
      `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${getTableName(ENTITIES)}/*`,
      `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${getTableName(CONSENTERS)}`,
      `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${getTableName(CONSENTERS)}/*`,
      `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${getTableName(CONFIG)}`,
      `arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${getTableName(CONFIG)}/*`,
    ] as string[];

    const environment = {
      PREFIX: prefix,
      DYNAMODB_USER_TABLE_NAME: getTableName(USERS),
      DYNAMODB_INVITATION_TABLE_NAME: getTableName(INVITATIONS),
      DYNAMODB_ENTITY_TABLE_NAME: getTableName(ENTITIES),
      DYNAMODB_CONSENTER_TABLE_NAME: getTableName(CONSENTERS),
      DYNAMODB_CONFIG_TABLE_NAME: getTableName(CONFIG),
      [ExhibitFormsBucketEnvironmentVariableName]: exhibitFormsBucket.bucketName,
      [DelayedExecutions.HandleStaleEntityVacancy.targetArnEnvVarName]: handleStaleEntityVacancyLambdaArn,
      [Configurations.ENV_VAR_NAME]: new Configurations(config).getJson() 
    };

    const preSignupFunction = new AbstractFunction(this, 'PreSignupFunction', {
      functionName: `${stackId}-${landscape}-${constructId.toLowerCase()}-pre-signup`,
      description: 'Intercepts cognito account creation to ensure proper registration pre-requisites have been met first.',
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
      timeout: Duration.seconds(10),
      handler: 'handler',
      logRetention: 7,
      cleanup: true,
      entry: path.join(__dirname, `lambda/functions/cognito/PreSignup.ts`),
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(this, 'PreSignupFunctionRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        description: 'Grants access to write to dynamodb and read from cognito userpool clients',
        inlinePolicies: {
          'EttCognitoPreSignupListingPolicy': new PolicyDocument({
            statements: [new PolicyStatement({
              actions: [
                'cognito-idp:List*'
              ],
              resources: [ '*' ],
              effect: Effect.ALLOW
            })],
          }),
          'EttCognitoPreSignupAdminPolicy': new PolicyDocument({
            statements: [new PolicyStatement({
              actions: [ 'cognito-idp:AdminGet*', 'cognito-idp:AdminDeleteUser' ],
              resources: [ `arn:aws:cognito-idp:${REGION}:${ACCOUNT}:userpool/${REGION}_*` ],
              effect: Effect.ALLOW
            })],
          }),
          'EttCognitoPreSignupReadWriteToDynamodb': new PolicyDocument({
            statements: [new PolicyStatement({
              actions: [
                'dynamodb:*'
              ],
              resources: dynamodbResources,
              effect: Effect.ALLOW
            })],
          })
        }
      }),
      environment
    });

    const postSignupFunction = new AbstractFunction(this, 'PostSignupFunction', {
      functionName: `${stackId}-${landscape}-${constructId.toLowerCase()}-post-signup`,
      description: 'Handles entry of a user into dynamodb directly after signing up in cognito.',
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
      timeout: Duration.seconds(10),
      handler: 'handler',
      logRetention: 7,
      cleanup: true,
      entry: path.join(__dirname, `lambda/functions/cognito/PostSignup.ts`),
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(this, 'PostSignupFunctionRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        description: 'Grants access to write to dynamodb and read from cognito userpool clients',
        inlinePolicies: {
          'EttPostSignupListUserPoolClients': new PolicyDocument({
            statements: [new PolicyStatement({
              actions: [
                'cognito-idp:ListUserPoolClients',
              ],
              resources: ['*'],
              effect: Effect.ALLOW
            })],
          }),
          'EttPostSignupDeleteUserFromPool': new PolicyDocument({
            statements: [ new PolicyStatement({
              actions: [
                'cognito-idp:AdminDeleteUser',
              ],
              resources: [ `arn:aws:cognito-idp:${REGION}:${ACCOUNT}:userpool/${REGION}_*` ],
              effect: Effect.ALLOW
            })]
          }),
          'EttPostSignupWriteToDynamodb': new PolicyDocument({
            statements: [new PolicyStatement({
              actions: [
                'dynamodb:*'
              ],
              resources: dynamodbResources,
              effect: Effect.ALLOW
            })],
          }),
          'EttPostSignupEventBridgePolicy': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [ 'scheduler:CreateSchedule' ],
                resources: [
                  `arn:aws:scheduler:${REGION}:${ACCOUNT}:schedule/${scheduleGroupName}/*`
                ],
                effect: Effect.ALLOW
              }),
              new PolicyStatement({
                actions: [ 'lambda:AddPermission' ],
                resources: [
                  `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${stackId}-${DelayedExecutions.HandleStaleEntityVacancy.coreName}`
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
          'EttPostSignupSesPolicy': new PolicyDocument({
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
        ...environment, 
        CLOUDFRONT_DOMAIN: cloudfrontDomain,
        CONSENTING_PERSON_PATH, RE_ADMIN_PATH, RE_AUTH_IND_PATH, TERMS_OF_USE_PATH
      }
    });

    const preAuthenticationFunction = new AbstractFunction(this, 'PreAuthenticationFunction', {
      functionName: `${stackId}-${landscape}-${constructId.toLowerCase()}-pre-authentication`,
      description: 'Cancels login attempt if user is does not have the role they selected to sign in with',
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
      handler: 'handler',
      logRetention: 7,
      cleanup: true,
      entry: path.join(__dirname, `lambda/functions/cognito/PreAuthentication.ts`),
      bundling: {
        externalModules: [
          '@aws-sdk/*',
        ]
      },
      role: new Role(this, 'PreAuthenticationFunctionRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        description: 'Grants access to read from dynamodb cognito userpool clients',
        inlinePolicies: {
          'EttPreAuthListUserPoolClients': new PolicyDocument({
            statements: [new PolicyStatement({
              actions: [
                'cognito-idp:ListUserPoolClients',
                'cognito-idp:AdminUpdateUserAttributes',
              ],
              resources: ['*'],
              effect: Effect.ALLOW
            })],
          }),
          'EttPreAuthReadFromDynamodb': new PolicyDocument({
            statements: [new PolicyStatement({
              actions: [
                'dynamodb:*'
              ],
              resources: dynamodbResources,
              effect: Effect.ALLOW
            })],
          }),
        }
      }),
      environment
    });

    this.userPool = new UserPool(this, 'UserPool', {
      removalPolicy: RemovalPolicy.DESTROY,
      userPoolName: this.userPoolName,
      accountRecovery: AccountRecovery.EMAIL_AND_PHONE_WITHOUT_MFA,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(7)
      },
      standardAttributes: {
        email: { required:true, mutable:false },
        phoneNumber: { required:true, mutable:true },
      },
      lambdaTriggers: {
        preAuthentication: preAuthenticationFunction,
        preSignUp: preSignupFunction,
        postConfirmation: postSignupFunction,
      }
    });

    this.userPoolDomain = new UserPoolDomain(this, 'Domain', {
      userPool: this.userPool,
      cognitoDomain: {
        domainPrefix: `${stackId}-${landscape}`,
      }
    });

    // TODO: figure out how to add an image for custom logo
    // https://github.com/aws/aws-cdk/issues/6953
    // https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-app-ui-customization.html
    // const uiAttachment = new CfnUserPoolUICustomizationAttachment(
    //   this,
    //   `${stackId}-${this.constructId.toLowerCase()}-ui-attachment`,
    //   {
    //     clientId: this.userPoolClient.userPoolClientId,
    //     userPoolId: this.userPool.userPoolId,
    //     css: fs.readFileSync('./cognito-hosted-ui.css').toString('utf-8')
    //   }
    // );
  }

  public getUserPool(): UserPool {
    return this.userPool;
  }

  public getUserPoolName(): string {
    return this.userPoolName;
  }
  
  public getUserPoolDomain(): string {
    const { context: { REGION }} = this;
    const defaultVal = `${this.userPoolDomain.domainName}.auth.${REGION}.amazoncognito.com`;
    const baseUrlParts = /https?\:\/\/(.*)/.exec(this.userPoolDomain.baseUrl()) ?? [];
    if(baseUrlParts.length > 1) {
      return baseUrlParts[1];
    }
    return defaultVal;
  }
};
