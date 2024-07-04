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
  landscape: string
}

/**
 * This class wraps all api creation into one construct.
 */
export class ApiConstruct extends Construct {
  private _helloWorldApi: HelloWorldApi;
  private _sysAdminApi: SysAdminApi;
  private _reAdminApi: ReAdminUserApi;
  private _authIndApi: AuthorizedIndividualApi;
  private _consentingPersonApi: ConsentingPersonApi;

  constructor(scope: Construct, constructId: string, apiParms:ApiConstructParms) {
    super(scope, constructId);

    this._helloWorldApi = new HelloWorldApi(this, 'HelloWorld', apiParms);

    this._sysAdminApi = new SysAdminApi(this, 'SysAdminUser', apiParms);

    this._reAdminApi = new ReAdminUserApi(this, 'ReAdminUser', apiParms);

    this._authIndApi = new AuthorizedIndividualApi(this, 'AuthIndUser', apiParms);

    this._consentingPersonApi = new ConsentingPersonApi(this, 'ConsentPersonUser', apiParms);
  }

  public grantPermissionsTo = (dynamodb:DynamoDbConstruct, cognito:CognitoConstruct) => {

    const { reAdminApi, sysAdminApi, authIndApi, consentingPersonApi } = this;

    // Grant the sysadmin api read/write access to dynamodb tables
    dynamodb.getEntitiesTable().grantReadWriteData(sysAdminApi.getLambdaFunction());
    dynamodb.getInvitationsTable().grantReadWriteData(sysAdminApi.getLambdaFunction());
    dynamodb.getUsersTable().grantReadWriteData(sysAdminApi.getLambdaFunction());
    dynamodb.getConsentersTable().grantReadWriteData(sysAdminApi.getLambdaFunction());
    dynamodb.getConfigTable().grantReadWriteData(sysAdminApi.getLambdaFunction());

    // Grant the re administrator api permissions to read/write from the users table
    dynamodb.getUsersTable().grantReadWriteData(reAdminApi.getLambdaFunction());
    dynamodb.getInvitationsTable().grantReadWriteData(reAdminApi.getLambdaFunction());
    dynamodb.getEntitiesTable().grantReadWriteData(reAdminApi.getLambdaFunction());
    dynamodb.getConfigTable().grantReadData(reAdminApi.getLambdaFunction());

    // Grant the authorized individual api permissions to read/write from the users table
    dynamodb.getUsersTable().grantReadWriteData(authIndApi.getLambdaFunction());
    dynamodb.getInvitationsTable().grantReadWriteData(authIndApi.getLambdaFunction());
    dynamodb.getEntitiesTable().grantReadWriteData(authIndApi.getLambdaFunction());
    dynamodb.getConfigTable().grantReadData(authIndApi.getLambdaFunction());

    // Grant the consenter api permissions to read/write from the users table
    dynamodb.getConsentersTable().grantReadWriteData(consentingPersonApi.getLambdaFunction());
    dynamodb.getEntitiesTable().grantReadWriteData(consentingPersonApi.getLambdaFunction());
    dynamodb.getConfigTable().grantReadData(consentingPersonApi.getLambdaFunction());
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
    return this._consentingPersonApi;
  }
}