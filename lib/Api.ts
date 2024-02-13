import { Construct } from "constructs";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { HelloWorldApi } from "./role/HelloWorld";
import { SysAdminApi } from "./role/SysAdmin";
import { ReAdminUserApi } from "./role/ReAdmin";
import { AuthorizedIndividualApi } from "./role/AuthorizedIndividual";
import { ConsentingPersonApi } from "./role/ConsentingPerson";
import { DynamoDbConstruct } from "./DynamoDb";
import { CognitoConstruct } from "./Cognito";

export type ApiConstructParms = {
  userPool: UserPool,
  userPoolName: string,
  userPoolDomain: string,
  cloudfrontDomain: string,
  redirectPath: string,
}

/**
 * This class wraps all api creation into one construct.
 */
export class ApiConstruct extends Construct {
  private _helloWorldApi: HelloWorldApi;
  private _sysAdminApi: SysAdminApi;
  private _reAdminApi: ReAdminUserApi;
  private _authIndApi: AuthorizedIndividualApi;
  private _consentPersonApi: ConsentingPersonApi;

  constructor(scope: Construct, constructId: string, apiParms:ApiConstructParms) {
    super(scope, constructId);

    this._helloWorldApi = new HelloWorldApi(this, 'HelloWorld', apiParms);

    this._sysAdminApi = new SysAdminApi(this, 'SysAdminUser', apiParms);

    this._reAdminApi = new ReAdminUserApi(this, 'ReAdminUser', apiParms);

    this._authIndApi = new AuthorizedIndividualApi(this, 'AuthIndUser', apiParms);

    this._consentPersonApi = new ConsentingPersonApi(this, 'ConsentPersonUser', apiParms);
  }

  public grantPermissionsTo = (dynamodb:DynamoDbConstruct, cognito:CognitoConstruct) => {

    // Grant the sysadmin api read/write access to dynamodb tables
    dynamodb.getEntitiesTable().grantReadWriteData(this.sysAdminApi.getLambdaFunction());
    dynamodb.getInvitationsTable().grantReadWriteData(this.sysAdminApi.getLambdaFunction());
    dynamodb.getUsersTable().grantReadWriteData(this.sysAdminApi.getLambdaFunction());
    // Grant the sysadmin api permissions to read from the cognito userpool
    cognito.getUserPool().grant(this.reAdminApi.getLambdaFunction(), 
      'cognito-identity:Describe*', 
      'cognito-identity:Get*', 
      'cognito-identity:List*'
    );

    // Grant the re administrator api permissions to read/write from the users table
    dynamodb.getUsersTable().grantReadWriteData(this.reAdminApi.getLambdaFunction());
    dynamodb.getInvitationsTable().grantReadWriteData(this.reAdminApi.getLambdaFunction());
    dynamodb.getUsersTable().grantReadWriteData(this.reAdminApi.getLambdaFunction());
    // Grant the re administrator api permissions to read from the cognito userpool
    cognito.getUserPool().grant(this.reAdminApi.getLambdaFunction(), 
      'cognito-identity:Describe*', 
      'cognito-identity:Get*', 
      'cognito-identity:List*'
    );

    // TODO: Grant the appropriate iam policies to the auth ind and consenting persons lambdas
  }

  public get helloWorldApi(): HelloWorldApi {
    return this._helloWorldApi;
  }
  public get sysAdminApi(): SysAdminApi {
    return this._sysAdminApi;
  }
  public get reAdminApi(): ReAdminUserApi {
    return this._reAdminApi;
  }
  public get authIndApi(): AuthorizedIndividualApi {
    return this._authIndApi;
  }
  public get consentingPersonApi(): ConsentingPersonApi {
    return this._consentPersonApi;
  }
}