import { RemovalPolicy } from "aws-cdk-lib";
import { AttributeType, Billing, TableV2, TableClass, ProjectionType } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { IContext } from "../contexts/IContext";
import { EntityFields, UserFields, InvitationFields } from "./lambda/_lib/dao/entity";

export class DynamoDbConstruct extends Construct {
  
  static DYNAMODB_TABLES_USERS_TABLE_NAME: string = 'ett-users';
  static DYNAMODB_TABLES_ENTITY_TABLE_NAME: string = 'ett-entities';
  static DYNAMODB_TABLES_INVITATION_TABLE_NAME: string = 'ett-invitations';

  context: IContext;

  private usersTable: TableV2;
  private entitiesTable: TableV2;
  private invitationsTable: TableV2;
  
  constructor(scope: Construct, constructId: string, props?:any) {

    super(scope, constructId);

    this.context = scope.node.getContext('stack-parms');

    // Create a table for ALL users of any role.
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

    // Create a table for ALL registerend entities, to be managed by gatekeeper.
    this.entitiesTable = new TableV2(this, 'DbEntities', {
      tableName: DynamoDbConstruct.DYNAMODB_TABLES_ENTITY_TABLE_NAME,
      partitionKey: { name: EntityFields.entity_name, type: AttributeType.STRING },
      billing: Billing.onDemand(),
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
      deletionProtection: this.context.TAGS.Landscape == 'prod',
    });

    // Create a table for invitations sent to users.
    this.invitationsTable = new TableV2(this, 'DbInvitations', {
      tableName: DynamoDbConstruct.DYNAMODB_TABLES_INVITATION_TABLE_NAME,
      partitionKey: { name: InvitationFields.email, type: AttributeType.STRING },
      sortKey: { name: InvitationFields.entity_name, type: AttributeType.STRING },
      billing: Billing.onDemand(),
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
      deletionProtection: this.context.TAGS.Landscape == 'prod', 
      globalSecondaryIndexes: [
        {
          indexName: 'EntityIndex',
          partitionKey: { name: InvitationFields.entity_name, type: AttributeType.STRING },
          sortKey: { name: InvitationFields.email, type: AttributeType.STRING },
          projectionType: ProjectionType.KEYS_ONLY
        }
      ]    
    })
  }

  public getUsersTable(): TableV2 {
    return this.usersTable;
  }

  public getEntitiesTable(): TableV2 {
    return this.entitiesTable;
  }

  public getInvitationsTable(): TableV2 {
    return this.invitationsTable;
  }
}