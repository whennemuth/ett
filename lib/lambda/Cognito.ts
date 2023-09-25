import { Construct } from 'constructs';
import { IContext } from '../../contexts/IContext';
import { UserPool, UserPoolClient, UserPoolDomain, AccountRecovery, StringAttribute, CfnUserPoolUICustomizationAttachment} from 'aws-cdk-lib/aws-cognito';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { EttUserPoolClient } from '../CognitoUserPoolClient';

export interface CognitoProps { distribution: { domainName:string } };

export class CognitoConstruct extends Construct {

  private constructId: string;
  private scope: Construct;
  private context: IContext;
  private userPool: UserPool;
  private userPoolClient: UserPoolClient;
  private userPoolDomain: UserPoolDomain;
  private props: CognitoProps;

  constructor(scope: Construct, constructId: string, props:CognitoProps) {

    super(scope, constructId);

    this.scope = scope;
    this.constructId = constructId;
    this.context = scope.node.getContext('stack-parms');
    this.props = props;

    this.buildResources();
  }

  buildResources(): void {

    this.userPool = new UserPool(this, 'UserPool', {
      removalPolicy: RemovalPolicy.DESTROY,
      userPoolName: `${this.constructId}-userpool`,
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
      customAttributes: {
        email: new StringAttribute(),
        phone: new StringAttribute({ mutable: true })
      },
      standardAttributes: {
        fullname: { required: true, mutable: true },
        nickname: { required: false, mutable: true }
      }
    });

    this.userPoolClient = EttUserPoolClient.buildCustomScopedClient(this.userPool, 'entity-admin', {
      callbackDomainName: this.props.distribution.domainName,
    });

    this.userPoolDomain = new UserPoolDomain(this, 'Domain', {
      userPool: this.userPool,
      cognitoDomain: {
        domainPrefix: `${this.context.STACK_ID}-${this.context.TAGS.Landscape}`,
      }
    });

    this.userPool.addDomain('Domain', {
      cognitoDomain: {
        domainPrefix: `${this.context.STACK_ID}-${this.context.TAGS.Landscape}`,
      }
    });

    // TODO: figure out how to add an image for custom logo
    // https://github.com/aws/aws-cdk/issues/6953
    // https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-app-ui-customization.html
    // const uiAttachment = new CfnUserPoolUICustomizationAttachment(
    //   this,
    //   `${this.constructId}-ui-attachment`,
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

  public getUserPoolDomain(): string {
    return this.userPoolDomain.baseUrl();
  }
};
