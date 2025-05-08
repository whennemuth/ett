import { UserPool } from "aws-cdk-lib/aws-cognito";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { EnvVar } from "../lib/lambda/Utils";
import { CognitoConstruct } from "./Cognito";
import { DynamoDbConstruct } from "./DynamoDb";
import { AuthorizedIndividualApi } from "./role/AuthorizedIndividual";
import { ConsentingPersonApi } from "./role/ConsentingPerson";
import { HelloWorldApi } from "./role/HelloWorld";
import { ReAdminUserApi } from "./role/ReAdmin";
import { SysAdminApi } from "./role/SysAdmin";

export type ApiConstructParms = {
  userPool: UserPool,
  userPoolName: string,
  userPoolDomain: string,
  cloudfrontDomain: string,
  redirectPath: string,
  landscape: string,
  exhibitFormsBucket: Bucket,
  databaseExhibitFormPurgeLambdaArn: string,
  disclosureRequestReminderLambdaArn: string,
  bucketExhibitFormPurgeLambdaArn: string,
  handleStaleEntityVacancyLambdaArn: string,
  removeStaleInvitations: string,
  publicApiDomainNameEnvVar: EnvVar,
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

  public grantPermissionsTo = (dynamodb:DynamoDbConstruct, cognito:CognitoConstruct, exhibitFormsBucket:Bucket) => {

    const { reAdminApi, sysAdminApi, authIndApi, consentingPersonApi } = this;

    // Grant the sysadmin api read/write access to dynamodb tables
    dynamodb.getEntitiesTable().grantReadWriteData(sysAdminApi.getLambdaFunction());
    dynamodb.getInvitationsTable().grantReadWriteData(sysAdminApi.getLambdaFunction());
    dynamodb.getUsersTable().grantReadWriteData(sysAdminApi.getLambdaFunction());
    dynamodb.getConsentersTable().grantReadWriteData(sysAdminApi.getLambdaFunction());
    dynamodb.getConfigTable().grantReadWriteData(sysAdminApi.getLambdaFunction());
    // Grant the sysadmin add, edit, delete permissions on the exhibit forms bucket
    exhibitFormsBucket.grantReadWrite(sysAdminApi.getLambdaFunction());
    exhibitFormsBucket.grantDelete(sysAdminApi.getLambdaFunction());
    exhibitFormsBucket.grantPut(sysAdminApi.getLambdaFunction());

    // Grant the re administrator api appropriate permissions against dynamodb tables
    dynamodb.getUsersTable().grantReadWriteData(reAdminApi.getLambdaFunction());
    dynamodb.getInvitationsTable().grantReadWriteData(reAdminApi.getLambdaFunction());
    dynamodb.getEntitiesTable().grantReadWriteData(reAdminApi.getLambdaFunction());
    dynamodb.getConfigTable().grantReadData(reAdminApi.getLambdaFunction());
    dynamodb.getConsentersTable().grantReadWriteData(reAdminApi.getLambdaFunction());
    // Grant the administrator read & delete permissions on the exhibit forms bucket
    exhibitFormsBucket.grantRead(reAdminApi.getLambdaFunction());
    exhibitFormsBucket.grantDelete(reAdminApi.getLambdaFunction());

    // Grant the authorized individual api appropriate permissions against dynamodb tables
    dynamodb.getUsersTable().grantReadWriteData(authIndApi.getLambdaFunction());
    dynamodb.getInvitationsTable().grantReadWriteData(authIndApi.getLambdaFunction());
    dynamodb.getEntitiesTable().grantReadWriteData(authIndApi.getLambdaFunction());
    dynamodb.getConfigTable().grantReadData(authIndApi.getLambdaFunction());
    dynamodb.getConsentersTable().grantReadWriteData(authIndApi.getLambdaFunction());
    // Grant the authorized individual read & delete permissions on the exhibit forms bucket
    exhibitFormsBucket.grantRead(authIndApi.getLambdaFunction());
    exhibitFormsBucket.grantDelete(authIndApi.getLambdaFunction());

    // Grant the consenter api appropriate permissions against dynamodb tables
    dynamodb.getUsersTable().grantReadData(consentingPersonApi.getLambdaFunction());
    dynamodb.getConsentersTable().grantReadWriteData(consentingPersonApi.getLambdaFunction());
    dynamodb.getEntitiesTable().grantReadWriteData(consentingPersonApi.getLambdaFunction());
    dynamodb.getConfigTable().grantReadData(consentingPersonApi.getLambdaFunction());
    // Grant the consenter add, edit, delete permissions on the exhibit forms bucket
    exhibitFormsBucket.grantReadWrite(consentingPersonApi.getLambdaFunction());
    exhibitFormsBucket.grantDelete(consentingPersonApi.getLambdaFunction());
    exhibitFormsBucket.grantPut(consentingPersonApi.getLambdaFunction());
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