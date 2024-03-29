import { Construct } from 'constructs';
import { IContext } from '../contexts/IContext';
import { UserPool, UserPoolDomain, AccountRecovery, StringAttribute } from 'aws-cdk-lib/aws-cognito';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { AbstractFunction } from './AbstractFunction';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import path = require('path');
import { Effect, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { DynamoDbConstruct } from './DynamoDb';

export class CognitoConstruct extends Construct {

  private constructId: string;
  private context: IContext;
  private userPool: UserPool;
  private userPoolDomain: UserPoolDomain;
  private userPoolName: string;

  constructor(scope: Construct, constructId: string) {

    super(scope, constructId);

    this.constructId = constructId;
    this.context = scope.node.getContext('stack-parms');
    this.userPoolName = `ett-${this.constructId.toLowerCase()}-userpool`;
    this.buildResources();
  }

  buildResources(): void {

    const preSignupFunction = new AbstractFunction(this, 'PreSignupFunction', {
      functionName: `ett-${this.constructId.toLowerCase()}-pre-signup`,
      description: 'Intercepts cognito account creation to ensure proper registration pre-requisites have been met first.',
      runtime: Runtime.NODEJS_18_X,
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
          'ListUserPoolClients': new PolicyDocument({
            statements: [new PolicyStatement({
              actions: [
                'cognito-idp:ListUserPoolClients'
              ],
              resources: ['*'],
              effect: Effect.ALLOW
            })],
          }),
          'ReadWriteToDynamodb': new PolicyDocument({
            statements: [new PolicyStatement({
              actions: [
                'dynamodb:*'
              ],
              resources: [
                `arn:aws:dynamodb:${this.context.REGION}:${this.context.ACCOUNT}:table/${DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME}`,
                `arn:aws:dynamodb:${this.context.REGION}:${this.context.ACCOUNT}:table/${DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME}/*`,
                `arn:aws:dynamodb:${this.context.REGION}:${this.context.ACCOUNT}:table/${DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME}`,
                `arn:aws:dynamodb:${this.context.REGION}:${this.context.ACCOUNT}:table/${DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME}/*`,
                `arn:aws:dynamodb:${this.context.REGION}:${this.context.ACCOUNT}:table/${DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME}`,
                `arn:aws:dynamodb:${this.context.REGION}:${this.context.ACCOUNT}:table/${DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME}/*`
              ],
              effect: Effect.ALLOW
            })],
          }),
        }
      }),
      environment: {
        DYNAMODB_USER_TABLE_NAME: DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME,
        DYNAMODB_INVITATION_TABLE_NAME: DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME,
        DYNAMODB_ENTITY_TABLE_NAME: DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME
      }
    });

    const postSignupFunction = new AbstractFunction(this, 'PostSignupFunction', {
      functionName: `ett-${this.constructId.toLowerCase()}-post-signup`,
      description: 'Handles entry of a user into dynamodb directly after signing up in cognito.',
      runtime: Runtime.NODEJS_18_X,
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
          'ListUserPoolClients': new PolicyDocument({
            statements: [new PolicyStatement({
              actions: [
                'cognito-idp:ListUserPoolClients',
              ],
              resources: ['*'],
              effect: Effect.ALLOW
            })],
          }),
          'DeleteUserFromPool': new PolicyDocument({
            statements: [ new PolicyStatement({
              actions: [
                'cognito-idp:AdminDeleteUser',
              ],
              resources: [ `arn:aws:cognito-idp:${this.context.REGION}:${this.context.ACCOUNT}:userpool/${this.context.REGION}_*` ],
              effect: Effect.ALLOW
            })]
          }),
          'WriteToDynamodb': new PolicyDocument({
            statements: [new PolicyStatement({
              actions: [
                'dynamodb:*'
              ],
              resources: [
                `arn:aws:dynamodb:${this.context.REGION}:${this.context.ACCOUNT}:table/${DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME}`,
                `arn:aws:dynamodb:${this.context.REGION}:${this.context.ACCOUNT}:table/${DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME}/*`,
                `arn:aws:dynamodb:${this.context.REGION}:${this.context.ACCOUNT}:table/${DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME}`,
                `arn:aws:dynamodb:${this.context.REGION}:${this.context.ACCOUNT}:table/${DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME}/*`,
                `arn:aws:dynamodb:${this.context.REGION}:${this.context.ACCOUNT}:table/${DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME}`,
                `arn:aws:dynamodb:${this.context.REGION}:${this.context.ACCOUNT}:table/${DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME}/*`
              ],
              effect: Effect.ALLOW
            })],
          }),
        }
      }),
      environment: {
        DYNAMODB_USER_TABLE_NAME: DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME,
        DYNAMODB_INVITATION_TABLE_NAME: DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME,
        DYNAMODB_ENTITY_TABLE_NAME: DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME
      }
    });

    const preAuthenticationFunction = new AbstractFunction(this, 'PreAuthenticationFunction', {
      functionName: `ett-${this.constructId.toLowerCase()}-pre-authentication`,
      description: 'Cancels login attempt if user is does not have the role they selected to sign in with',
      runtime: Runtime.NODEJS_18_X,
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
          'ListUserPoolClients': new PolicyDocument({
            statements: [new PolicyStatement({
              actions: [
                'cognito-idp:ListUserPoolClients',
              ],
              resources: ['*'],
              effect: Effect.ALLOW
            })],
          }),
          'ReadFromDynamodb': new PolicyDocument({
            statements: [new PolicyStatement({
              actions: [
                'dynamodb:*'
              ],
              resources: [
                `arn:aws:dynamodb:${this.context.REGION}:${this.context.ACCOUNT}:table/${DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME}`,
                `arn:aws:dynamodb:${this.context.REGION}:${this.context.ACCOUNT}:table/${DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME}/*`,
                `arn:aws:dynamodb:${this.context.REGION}:${this.context.ACCOUNT}:table/${DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME}`,
                `arn:aws:dynamodb:${this.context.REGION}:${this.context.ACCOUNT}:table/${DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME}/*`,
                `arn:aws:dynamodb:${this.context.REGION}:${this.context.ACCOUNT}:table/${DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME}`,
                `arn:aws:dynamodb:${this.context.REGION}:${this.context.ACCOUNT}:table/${DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME}/*`
              ],
              effect: Effect.ALLOW
            })],
          }),
        }
      }),
      environment: {
        DYNAMODB_USER_TABLE_NAME: DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME,
        DYNAMODB_INVITATION_TABLE_NAME: DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME,
        DYNAMODB_ENTITY_TABLE_NAME: DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME
      }
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
        domainPrefix: `${this.context.STACK_ID}-${this.context.TAGS.Landscape}`,
      }
    });

    // TODO: figure out how to add an image for custom logo
    // https://github.com/aws/aws-cdk/issues/6953
    // https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-app-ui-customization.html
    // const uiAttachment = new CfnUserPoolUICustomizationAttachment(
    //   this,
    //   `ett-${this.constructId.toLowerCase()}-ui-attachment`,
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
    return this.userPoolDomain.baseUrl();
  }
};
