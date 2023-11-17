import { Construct } from "constructs";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { HelloWorldApi } from "./role/HelloWorld";
import { GatekeeperApi } from "./role/Gatekeeper";
import { ReAdminUserApi } from "./role/ReAdmin";
import { DynamoDbConstruct } from "./DynamoDb";
import { CognitoConstruct } from "./Cognito";

export type ApiParms = {
  userPool: UserPool,
  userPoolName: string,
  cloudfrontDomain: string,
  redirectPath: string,
}

/**
 * This class wraps all api creation into one construct.
 */
export class ApiConstruct extends Construct {
  private _helloWorldApi: HelloWorldApi;
  private _gatekeeperApi: GatekeeperApi;
  private _reAdminApi: ReAdminUserApi;

  constructor(scope: Construct, constructId: string, apiParms:ApiParms) {
    super(scope, constructId);

    this._helloWorldApi = new HelloWorldApi(this, 'HelloWorld', apiParms);

    this._reAdminApi = new ReAdminUserApi(this, 'ReAdminUser', apiParms);

    this._gatekeeperApi = new GatekeeperApi(this, 'GatekeeperUser', apiParms);
  }

  public grantPermissions = (dynamodb:DynamoDbConstruct, cognito:CognitoConstruct) => {

    // Grant the gatekeeper api the permissions to read/write from the users table
    dynamodb.getEntitiesTable().grantReadWriteData(this.gatekeeperApi.getLambdaFunction());
    dynamodb.getInvitationsTable().grantReadWriteData(this.gatekeeperApi.getLambdaFunction());

    // Grant the re administrator api permissions to read/write from the users table
    dynamodb.getUsersTable().grantReadWriteData(this.reAdminApi.getLambdaFunction());
    // Grant the re administrator api permissions to read from the cognito userpool
    cognito.getUserPool().grant(this.reAdminApi.getLambdaFunction(), 
      'cognito-identity:Describe*', 
      'cognito-identity:Get*', 
      'cognito-identity:List*'
    );
  }

  public get helloWorldApi(): HelloWorldApi {
    return this._helloWorldApi;
  }
  public get gatekeeperApi(): GatekeeperApi {
    return this._gatekeeperApi;
  }
  public get reAdminApi(): ReAdminUserApi {
    return this._reAdminApi;
  }
}