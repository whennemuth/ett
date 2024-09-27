import { RemovalPolicy } from "aws-cdk-lib";
import { AttributeType, Billing, ProjectionType, TableClass, TablePropsV2, TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { IContext } from "../contexts/IContext";
import * as ctx from '../contexts/context.json';
import { ConfigFields, ConsenterFields, EntityFields, InvitationFields, UserFields } from "./lambda/_lib/dao/entity";

export enum TableBaseNames {
  USERS = 'users', ENTITIES = 'entities', INVITATIONS = 'invitations', CONSENTERS = 'consenters', CONFIG = 'config'
}
export enum IndexBaseNames {
  USERS_ENTITY = 'users-entity',
  ENTITIES_ACTIVE = 'entities-active',
  ENTITIES_NAME_LOWER = 'entities-name-lower',
  INVITATIONS_ENTITY = 'invitations-entity',
  INVITATIONS_EMAIL = 'invitations-email',
  CONSENTERS_ACTIVE = 'consenters-active'
}
export class DynamoDbConstruct extends Construct {

  static getTableName = (basename:TableBaseNames):string => {
    const context:IContext = <IContext>ctx;
    const { TAGS: { Landscape }, STACK_ID } = context;
    return `${STACK_ID}-${Landscape}-${basename}`
  }

  static getTableNames = ():string[] => {
    return Object.values<string>(TableBaseNames).map((basename:string) => { 
      return this.getTableName(basename as TableBaseNames); 
    });
  }
  
  context: IContext;

  private usersTable: TableV2;
  private entitiesTable: TableV2;
  private invitationsTable: TableV2;
  private consentersTable: TableV2;
  private configTable: TableV2;
  
  constructor(scope: Construct, constructId: string, props?:any) {

    super(scope, constructId);

    this.context = scope.node.getContext('stack-parms');
    const { Landscape } = this.context.TAGS ?? {};
    const deletionProtection = Landscape == 'prod';
    const { CONFIG: { useDatabase } } = this.context;
    const { getTableName } = DynamoDbConstruct;
    const { CONFIG, CONSENTERS, ENTITIES, INVITATIONS, USERS } = TableBaseNames;
    const { ENTITIES_ACTIVE, ENTITIES_NAME_LOWER, USERS_ENTITY, INVITATIONS_EMAIL, INVITATIONS_ENTITY, CONSENTERS_ACTIVE } = IndexBaseNames;

    // Create a table for SYS_ADMIN, RE_ADMIN, and RE_AUTH_IND users.
    this.usersTable = new TableV2(this, 'DbUsers', {
      tableName: getTableName(USERS),
      partitionKey: { name: UserFields.email, type: AttributeType.STRING },
      sortKey: { name: UserFields.entity_id, type: AttributeType.STRING },
      billing: Billing.onDemand(),
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
      deletionProtection, 
      globalSecondaryIndexes: [
        {
          indexName: USERS_ENTITY,
          partitionKey: { name: UserFields.entity_id, type: AttributeType.STRING },
          sortKey: { name: UserFields.email, type: AttributeType.STRING },
          projectionType: ProjectionType.ALL,
        }
      ]    
    } as TablePropsV2);

    // Create a table for ALL registerend entities.
    this.entitiesTable = new TableV2(this, 'DbEntities', {
      tableName: getTableName(ENTITIES),
      partitionKey: { name: EntityFields.entity_id, type: AttributeType.STRING },
      billing: Billing.onDemand(),
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
      deletionProtection,
      globalSecondaryIndexes: [
        {
          indexName: ENTITIES_ACTIVE,
          partitionKey: { name: EntityFields.active, type: AttributeType.STRING },
          sortKey: { name: EntityFields.entity_name, type: AttributeType.STRING },
          projectionType: ProjectionType.INCLUDE,
          nonKeyAttributes: [ EntityFields.entity_id, EntityFields.entity_name ]
        },
        {
          indexName: ENTITIES_NAME_LOWER,
          partitionKey: { name: EntityFields.entity_name_lower, type: AttributeType.STRING },
          sortKey: { name: EntityFields.active, type: AttributeType.STRING },
          projectionType: ProjectionType.INCLUDE,
          nonKeyAttributes: [ EntityFields.entity_id, EntityFields.entity_name ]
        }
      ]
    });

    // Create a table for invitations sent to users.
    this.invitationsTable = new TableV2(this, 'DbInvitations', {
      tableName: getTableName(INVITATIONS),
      partitionKey: { name: InvitationFields.code, type: AttributeType.STRING },
      billing: Billing.onDemand(),
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
      deletionProtection, 
      globalSecondaryIndexes: [
        {
          indexName: INVITATIONS_EMAIL,
          partitionKey: { name: InvitationFields.email, type: AttributeType.STRING },
          sortKey: { name: InvitationFields.entity_id, type: AttributeType.STRING },
          projectionType: ProjectionType.ALL,
        },
        {
          indexName: INVITATIONS_ENTITY,
          partitionKey: { name: InvitationFields.entity_id, type: AttributeType.STRING },
          sortKey: { name: InvitationFields.email, type: AttributeType.STRING },
          projectionType:ProjectionType.ALL
        }
      ]
    } as TablePropsV2);

    // Create a table for CONSENTING_PERSON users
    this.consentersTable = new TableV2(this, 'DbConsenters', {
      tableName: getTableName(CONSENTERS),
      partitionKey: { name: ConsenterFields.email, type: AttributeType.STRING },
      billing: Billing.onDemand(),
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
      deletionProtection,
      globalSecondaryIndexes: [
        {
          indexName: CONSENTERS_ACTIVE,
          partitionKey: { name: ConsenterFields.active, type: AttributeType.STRING },
          sortKey: { name: ConsenterFields.email, type: AttributeType.STRING },
          projectionType: ProjectionType.INCLUDE,
          nonKeyAttributes: [ 
            ConsenterFields.email, 
            ConsenterFields.sub, 
            ConsenterFields.firstname, 
            ConsenterFields.middlename, 
            ConsenterFields.lastname ]
        }
      ]
    } as TablePropsV2);

    if(useDatabase) {
      // Create a table for system configurations
      this.configTable = new TableV2(this, 'DbConfig', {
        tableName: getTableName(CONFIG),
        partitionKey: { name: ConfigFields.name, type: AttributeType.STRING },
        billing: Billing.onDemand(),
        tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
        removalPolicy: RemovalPolicy.DESTROY,
        pointInTimeRecovery: true,
        deletionProtection,
      } as TablePropsV2);
    }
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

  public getConfigTable(): TableV2 {
    return this.configTable ?? {
      grantReadWriteData: (parm?:any) => { console.log('Config table not implemented'); },
      grantReadData: (parm?:any) => { console.log('Config table not implemented'); }
    } as TableV2;
  }
}