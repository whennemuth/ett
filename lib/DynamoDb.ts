import { RemovalPolicy } from "aws-cdk-lib";
import { AttributeType, Billing, TableV2, TableClass, ProjectionType } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { IContext } from "../contexts/IContext";
import { UserFields } from "./lambda/dao/entity";

export class DynamoDbConstruct extends Construct {
  
  static DYNAMODB_TABLES_USERS_TABLE_NAME: string = 'ett-users';

  context: IContext;

  private usersTable: TableV2;
  
  constructor(scope: Construct, constructId: string, props:any) {

    super(scope, constructId);

    this.context = scope.node.getContext('stack-parms');

    this.usersTable = new TableV2(this, 'DbUsers', {
      tableName: DynamoDbConstruct.DYNAMODB_TABLES_USERS_TABLE_NAME,
      partitionKey: { name: UserFields.email, type: AttributeType.STRING },
      sortKey: { name: UserFields.entity_name, type: AttributeType.STRING },
      billing: Billing.onDemand(),
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
      deletionProtection: this.context.TAGS.Landscape == 'prod', 
      globalSecondaryIndexes: [
        {
          indexName: 'EntityIndex',
          partitionKey: { name: UserFields.entity_name, type: AttributeType.STRING },
          sortKey: { name: UserFields.email, type: AttributeType.STRING },
          projectionType: ProjectionType.KEYS_ONLY,
          // projectionType: ProjectionType.INCLUDE,
          // nonKeyAttributes: [ role, disclosures, etc...]
        }
      ]    
    });
  }

  public getUsersTable(): TableV2 {
    return this.usersTable;
  }
}