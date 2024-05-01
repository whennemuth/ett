import { RemovalPolicy } from "aws-cdk-lib";
import { AttributeType, Billing, TableV2, TableClass, ProjectionType, TablePropsV2 } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { IContext } from "../contexts/IContext";
import { EntityFields, UserFields, InvitationFields, ConsenterFields } from "./lambda/_lib/dao/entity";

export class DynamoDbConstruct extends Construct {
  
  static DYNAMODB_USER_TABLE_NAME: string = 'ett-users';
  static DYNAMODB_ENTITY_TABLE_NAME: string = 'ett-entities';
  static DYNAMODB_INVITATION_TABLE_NAME: string = 'ett-invitations';
  static DYNAMODB_CONSENTER_TABLE_NAME: string = 'ett-consenter';

  static DYNAMODB_USER_ENTITY_INDEX: string = 'EntityIndex';
  static DYNAMODB_INVITATION_ENTITY_INDEX: string = 'EntityIndex';
  static DYNAMODB_INVITATION_EMAIL_INDEX: string = 'EmailIndex';
  
  context: IContext;

  private usersTable: TableV2;
  private entitiesTable: TableV2;
  private invitationsTable: TableV2;
  private consentersTable: TableV2;
  
  constructor(scope: Construct, constructId: string, props?:any) {

    super(scope, constructId);

    this.context = scope.node.getContext('stack-parms');

    // Create a table for SYS_ADMIN, RE_ADMIN, and RE_AUTH_IND users.
    this.usersTable = new TableV2(this, 'DbUsers', {
      tableName: DynamoDbConstruct.DYNAMODB_USER_TABLE_NAME,
      partitionKey: { name: UserFields.email, type: AttributeType.STRING },
      sortKey: { name: UserFields.entity_id, type: AttributeType.STRING },
      billing: Billing.onDemand(),
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
      deletionProtection: this.context.TAGS.Landscape == 'prod', 
      globalSecondaryIndexes: [
        {
          indexName: DynamoDbConstruct.DYNAMODB_USER_ENTITY_INDEX,
          partitionKey: { name: UserFields.entity_id, type: AttributeType.STRING },
          sortKey: { name: UserFields.email, type: AttributeType.STRING },
          projectionType: ProjectionType.ALL,
          // projectionType: ProjectionType.KEYS_ONLY,
          // projectionType: ProjectionType.INCLUDE,
          // nonKeyAttributes: [ role, disclosures, etc...]
        }
      ]    
    } as TablePropsV2);

    // Create a table for ALL registerend entities, to be managed by system administrator.
    this.entitiesTable = new TableV2(this, 'DbEntities', {
      tableName: DynamoDbConstruct.DYNAMODB_ENTITY_TABLE_NAME,
      partitionKey: { name: EntityFields.entity_id, type: AttributeType.STRING },
      billing: Billing.onDemand(),
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
      deletionProtection: this.context.TAGS.Landscape == 'prod',
    });

    // Create a table for invitations sent to users.
    this.invitationsTable = new TableV2(this, 'DbInvitations', {
      tableName: DynamoDbConstruct.DYNAMODB_INVITATION_TABLE_NAME,
      partitionKey: { name: InvitationFields.code, type: AttributeType.STRING },
      billing: Billing.onDemand(),
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
      deletionProtection: this.context.TAGS.Landscape == 'prod', 
      globalSecondaryIndexes: [
        {
          indexName: DynamoDbConstruct.DYNAMODB_INVITATION_EMAIL_INDEX,
          partitionKey: { name: InvitationFields.email, type: AttributeType.STRING },
          sortKey: { name: InvitationFields.entity_id, type: AttributeType.STRING },
          projectionType: ProjectionType.ALL,
        },
        {
          indexName: DynamoDbConstruct.DYNAMODB_INVITATION_ENTITY_INDEX,
          partitionKey: { name: InvitationFields.entity_id, type: AttributeType.STRING },
          sortKey: { name: InvitationFields.email, type: AttributeType.STRING },
          projectionType:ProjectionType.ALL
        }
      ]  
    } as TablePropsV2);

    // Create a table for CONSENTING_PERSON users
    this.consentersTable = new TableV2(this, 'DbConsenters', {
      tableName: DynamoDbConstruct.DYNAMODB_CONSENTER_TABLE_NAME,
      partitionKey: { name: ConsenterFields.email, type: AttributeType.STRING },
      billing: Billing.onDemand(),
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
      deletionProtection: this.context.TAGS.Landscape == 'prod',
    } as TablePropsV2)
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

  public getConsentersTable(): TableV2 {
    return this.consentersTable;
  }
}