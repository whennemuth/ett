import { DynamoDBClient, TransactWriteItem, TransactWriteItemsCommand, TransactWriteItemsCommandInput } from "@aws-sdk/client-dynamodb";
import { marshall } from '@aws-sdk/util-dynamodb';
import { DAOFactory } from "../../_lib/dao/dao";
import { Entity, Invitation, User } from "../../_lib/dao/entity";
import { CognitoIdentityProviderClient, AdminDeleteUserCommand, AdminDeleteUserRequest, AdminDeleteUserCommandOutput } from '@aws-sdk/client-cognito-identity-provider';
import { lookupUserPoolId } from "../../_lib/cognito/Lookup";
import { DynamoDbConstruct, TableBaseNames } from "../../../DynamoDb";
import { log } from "../../Utils";
import { IContext } from "../../../../contexts/IContext";
import { BucketInventory } from "../../functions/consenting-person/BucketInventory";
import { DeleteObjectsCommandOutput, ObjectIdentifier } from "@aws-sdk/client-s3";
import { BucketItem } from "../../functions/consenting-person/BucketItem";
import { EntityCrud } from "../../_lib/dao/dao-entity";
import { Cleanup, CleanupParms } from "../../_lib/timer/cleanup/Cleanup";
import { FilterForStaleEntityVacancy } from "../../_lib/timer/cleanup/FilterForStaleEntityVacancy";
import { FilterForPurgeExhibitFormFromBucket } from "../../_lib/timer/cleanup/FilterForPurgeExhibitFormFromBucket";
import { FilterForPurgeExhibitFormFromDatabase } from "../../_lib/timer/cleanup/FilterForPurgeExhibitFormFromDatabase";
import { FilterForSendDisclosureRequestReminder } from "../../_lib/timer/cleanup/FilterForSendDisclosureRequestReminder";
import { FilterForStaleInvitation } from "../../_lib/timer/cleanup/FilterForStaleInvitation";

const dbclient = new DynamoDBClient({ region: process.env.REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });
export type DemolitionRecord = {
  databaseCommandInput: TransactWriteItemsCommandInput,
  deletedUsers: User[]
}
/**
 * This class implements is the "Nuclear Option" for an entity. That is, for any given entity:
 *   1) Every user belonging to the entity is removed from the database.
 *   2) Every record of an invitation to the entity sent to any user is removed from the corresponding database table.
 *   3) The one item corresponding to the entity is removed from the entities database table.
 *   4) Every user that was deleted is correspondingly deleted from the cognito userpool.
 * This effectively purges all record of and activity related to the entity from the system and restores to
 * a state that existed before the SYS_ADMIN first invited the RE_ADMIN into the system to create the entity.
 */
export class EntityToDemolish {
  private entityId: string;
  private purgeBucket: boolean;
  private dynamodbCommandInput: TransactWriteItemsCommandInput;
  private _entity: Entity;
  private _deletedUsers = [] as User[];
  private _dryRun = false;
  private _deletedSchedules = [] as string[];
  private _deletedBucketKeys = [] as string[];

  constructor(entityId:string, purgeBucket:boolean=true) {
    this.entityId = entityId;
    this.purgeBucket = purgeBucket;
  }

  /**
   * Purge all items related to the entity from each table in the database.
   * @returns 
   */
  public deleteEntityFromDatabase = async ():Promise<any> => {
    log(' ');
    log(`--------- BEGIN CLEANING UP DATABASE ---------`);

    const TransactItems = [] as TransactWriteItem[];
    const { getTableName } = DynamoDbConstruct;
    const { USERS, INVITATIONS, ENTITIES } = TableBaseNames
  
    // Load commands to delete each item from the users table where the user belongs to the specified entity.
    let TableName = getTableName(USERS);
    const daoUser = DAOFactory.getInstance({ DAOType: 'user', Payload: { entity_id:this.entityId } as User });
    const users = await daoUser.read() as User[];
    users.forEach((user) => {
      const { entity_id, email } = user;
      const Key = marshall({ entity_id, email } as User);
      TransactItems.push({ Delete: { TableName, Key }} as TransactWriteItem);
      this._deletedUsers.push(user);   
    });
  
    // Load commands to delete each item from the invitations table that invited somebody to the specified entity.
    TableName = getTableName(INVITATIONS);
    const daoInvitation = DAOFactory.getInstance({ DAOType: 'invitation', Payload: { entity_id:this.entityId } as Invitation });
    const invitations = await daoInvitation.read() as Invitation[];
    invitations.forEach((invitation) => {
      const { code } = invitation;
      const Key = marshall({ code } as Invitation);
      TransactItems.push({ Delete: { TableName, Key }} as TransactWriteItem);
    });
  
    // Load the one command to delete the entity itself from the entities table.
    TableName = getTableName(ENTITIES);
    const daoEntity = DAOFactory.getInstance({ DAOType: 'entity', Payload: { entity_id:this.entityId } as Entity });
    this._entity = await daoEntity.read() as Entity;
    const Key = marshall({ entity_id: this.entityId } as Entity);
    TransactItems.push({
      Delete: { TableName, Key }
    } as TransactWriteItem);
    
    // Execute the transaction
    this.dynamodbCommandInput = { TransactItems } as TransactWriteItemsCommandInput;  
    log(this.dynamodbCommandInput, `Demolishing entity from dynamodb`);
    const transCommand = new TransactWriteItemsCommand(this.dynamodbCommandInput);
    if(this._dryRun) {
      log(`--------- END CLEANING UP DATABASE ---------`);
      return new Promise((resolve) => resolve('dryrun'));
    }
    log(`--------- END CLEANING UP DATABASE ---------`);
    return await dbclient.send(transCommand);
  }

  /**
   * Delete from the userpool each user that can be found in the list of users whose corresponding
   * items have just been deleted from the dynamodb users table.
   */
  public deleteEntityFromUserPool = async ():Promise<any> => {
    log(' ');
    log(`--------- BEGIN CLEANING UP USERPOOL ---------`);
    const UserPoolId = process.env.USERPOOL_ID;
    const deleteUser = async (Username:string, email:string):Promise<AdminDeleteUserCommandOutput|string> => {
      const input = { UserPoolId, Username } as AdminDeleteUserRequest;
      const command = new AdminDeleteUserCommand(input);
      log(input, `Demolishing ${email} from userpool related to entity ${this.entityId}`);
      if(this._dryRun) {
        return new Promise((resolve) => resolve('dryrun'));
      }
      const output = await cognitoClient.send(command) as AdminDeleteUserCommandOutput;
      return output;
    }
    for(var i=0; i<this._deletedUsers.length; i++) {
      const { sub:username, email } = this._deletedUsers[i];
      try {
        const output:AdminDeleteUserCommandOutput|string = await deleteUser(username, email);
        log(output, `User ${username}/${email} deleted`);
      }
      catch(reason:any) {
        if(reason.name == 'UserNotFoundException') {
          log(`Cannot delete ${email} from userpool: ${reason.message}`)
        }
        else {
          log(reason);
        }        
      }
    }
    log(`--------- END CLEANING UP USERPOOL ---------`);
  }

  /**
   * Delete the content of every consenter in the exhibit forms bucket that each has related to the entity (if any).
   */
  public deleteBucketContentForEntity = async () => {
    log(' ');
    log(`--------- BEGIN CLEANING UP BUCKET ---------`);
    const { entity } = this;
    if( ! entity) {
      this._entity = await EntityCrud({ entity_id:this.entityId } as Entity ).read() as Entity;
    }
    const { entity: { entity_id } } = this;
    const inventory = await BucketInventory.getInstanceForEntity(entity_id);
    const keys = inventory.getKeys();
    this._deletedBucketKeys.push(...keys);
    const objIds = keys.map(Key => ({ Key })) as ObjectIdentifier[];
    const deleteResult:DeleteObjectsCommandOutput = await new BucketItem().deleteMultipleItems(objIds);

    // Handle any returned errors
    const errors = (deleteResult.Errors ?? []).length;
    if(errors > 0) {
      let msg = `Errors encountered deleting bucket content for ${entity_id}:`
      deleteResult.Errors?.forEach(e => {
        msg = `${msg}
        ${JSON.stringify(e, null, 2)}`;
      });
      throw new Error(msg);
    }

    // Log success message
    console.log("Successful - deleted:", (deleteResult.Deleted ?? []).length, "objects");
    log(`--------- END CLEANING UP BUCKET ---------`);
  }

  /**
   * Delete any event bridge schedules related to the entity.
   */
  public deleteEventBridgeSchedulesForEntity = async () => {
    const region = process.env.REGION;
    if( ! region) throw new Error('REGION environment variable not set');
    const prefix = process.env.PREFIX;
    if( ! prefix) throw new Error('PREFIX environment variable not set');
    const landscape = prefix.split('-')[1];
    log(' ');
    log(`--------- BEGIN CLEANING UP SCHEDULES FOR "${landscape}" LANDSCAPE ---------`);
    const { entity } = this;
    if( ! entity) {
      this._entity = await EntityCrud({ entity_id:this.entityId } as Entity ).read() as Entity;
    }
    const { entity: { entity_id } } = this;
  
    const cleanupParms = { region, landscape, entity_id } as CleanupParms;
    const cleanup = new Cleanup(cleanupParms, [ 
      new FilterForStaleInvitation(region),
      new FilterForStaleEntityVacancy(region),
      new FilterForPurgeExhibitFormFromBucket(cleanupParms),
      new FilterForPurgeExhibitFormFromDatabase(cleanupParms),
      new FilterForSendDisclosureRequestReminder(cleanupParms)
    ]);

    await cleanup.cleanup();
    this._deletedSchedules.push(...cleanup.getDeletedSchedules());
    log(`--------- END CLEANING UP SCHEDULES FOR "${landscape}" LANDSCAPE ---------`);
  }

  /**
   * Demolish everything related to the entity.
   */
  public demolish = async ():Promise<any> => {
    log('------------------------------------------');
    log(`             BEGIN DEMOLITION             `);
    log('------------------------------------------');

    await this.deleteEntityFromDatabase();

    await this.deleteEntityFromUserPool();

    if(this.purgeBucket) {
      await this.deleteBucketContentForEntity();
    }
    else {
      log(`Demolition of entity ${this.entityId} will NOT affect related exhibit form content in S3`);
    }

    await this.deleteEventBridgeSchedulesForEntity();
    log('------------------------------------------');
    log(`              END DEMOLITION              `);
    log('------------------------------------------');
  }

  // Getters and setters
  public get entity(): Entity {
    return this._entity;
  }
  public get deletedUsers(): User[] {
    return this._deletedUsers;
  }
  public set deletedUsers(users:User[]) {
    this._deletedUsers.push(...users);
  }
  public get commandInput(): TransactWriteItemsCommandInput|undefined {
    return this.dynamodbCommandInput;
  }
  public get demolitionRecord(): DemolitionRecord {
    return {
      databaseCommandInput: this.dynamodbCommandInput,
      deletedUsers: this._deletedUsers,
    } as DemolitionRecord
  }
  public set dryRun(_dryRun:boolean) {
    this._dryRun = _dryRun;
  }
  public get deletedSchedules(): string[] {
    return this._deletedSchedules;
  }
  public get deletedBucketKeys(): string[] {
    return this._deletedBucketKeys;
  }
}


/**
 * RUN MANUALLY: Modify the task, landscape, entity_id, and dryRun settings as needed.
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/demolition/Demolition.ts')) {

  (async () => {
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, REGION, TAGS: { Landscape } } = context;
    const dryRun = false;
    const entity_id = 'db542060-7de0-4c55-be58-adc92671d63a';
    const userpoolId = await lookupUserPoolId(`${STACK_ID}-${Landscape}-cognito-userpool`, REGION);

    process.env.USERPOOL_ID = userpoolId;
    process.env.REGION = REGION;

    const entityToDemolish = new EntityToDemolish(entity_id);
    entityToDemolish.dryRun = dryRun;
    entityToDemolish.deletedUsers = [
      { sub: '44f80329-a6f8-4c3d-8e50-36fc422035d5' } as User,
      { sub: 'd250ef9d-0e4d-4fb2-b490-c7e60d8e9afd' } as User,
      { sub: 'f66b3491-5476-4fd1-b0c2-324cd5eac7f4' } as User
    ];
    await entityToDemolish.deleteEntityFromUserPool();
    log('Entity deleted');
  })();
}
