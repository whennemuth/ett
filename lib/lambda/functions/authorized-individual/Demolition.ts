import { DynamoDBClient, TransactWriteItem, TransactWriteItemsCommand, TransactWriteItemsCommandInput } from "@aws-sdk/client-dynamodb";
import { marshall } from '@aws-sdk/util-dynamodb';
import { DAOFactory } from "../../_lib/dao/dao";
import { Entity, Invitation, User } from "../../_lib/dao/entity";
import { CognitoIdentityProviderClient, AdminDeleteUserCommand, AdminDeleteUserRequest } from '@aws-sdk/client-cognito-identity-provider';

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
  private dynamodbCommandInput: TransactWriteItemsCommandInput;
  private _entity: Entity;
  private _deletedUsers = [] as User[];
  private _dryRun = false;

  constructor(entityId:string) {
    this.entityId = entityId;
  }

  /**
   * Purge all items related to the entity from each table in the database.
   * @returns 
   */
  public deleteEntityFromDatabase = async ():Promise<any> => {

    const TransactItems = [] as TransactWriteItem[];
  
    // Load commands to delete each item from the users table where the user belongs to the specified entity.
    let TableName = process.env.DYNAMODB_USER_TABLE_NAME;
    const daoUser = DAOFactory.getInstance({ DAOType: 'user', Payload: { entity_id:this.entityId } as User });
    const users = await daoUser.read() as User[];
    users.forEach((user) => {
      const { entity_id, email } = user;
      const Key = marshall({ entity_id, email } as User);
      TransactItems.push({ Delete: { TableName, Key }} as TransactWriteItem);
      this._deletedUsers.push(user);   
    });
  
    // Load commands to delete each item from the invitations table that invited somebody to the specified entity.
    TableName = process.env.DYNAMODB_INVITATION_TABLE_NAME;
    const daoInvitation = DAOFactory.getInstance({ DAOType: 'invitation', Payload: { entity_id:this.entityId } as Invitation });
    const invitations = await daoInvitation.read() as Invitation[];
    invitations.forEach((invitation) => {
      const { code } = invitation;
      const Key = marshall({ code } as Invitation);
      TransactItems.push({ Delete: { TableName, Key }} as TransactWriteItem);
    });
  
    // Load the one command to delete the entity itself from the entities table.
    TableName = process.env.DYNAMODB_ENTITY_TABLE_NAME;
    const daoEntity = DAOFactory.getInstance({ DAOType: 'entity', Payload: { entity_id:this.entityId } as Entity });
    this._entity = await daoEntity.read() as Entity;
    const Key = marshall({ entity_id: this.entityId } as Entity);
    TransactItems.push({
      Delete: { TableName, Key }
    } as TransactWriteItem);
    
    // Execute the transaction
    this.dynamodbCommandInput = { TransactItems } as TransactWriteItemsCommandInput;  
    console.log(`Demolishing entity from dynamodb: ${JSON.stringify(this.dynamodbCommandInput, null, 2)}`);
    const transCommand = new TransactWriteItemsCommand(this.dynamodbCommandInput);
    if(this._dryRun) {
      return new Promise((resolve) => resolve('dryrun'));
    }
    return await dbclient.send(transCommand);
  }

  /**
   * Delete from the userpool each user that can be found in the list of users whose corresponding
   * items have just been deleted from the dynamodb users table.
   */
  public deleteEntityFromUserPool = async ():Promise<any> => {
    const UserPoolId = process.env.USERPOOL_ID;
    const deleteUser = async (Username:string):Promise<any> => {
      const input = { UserPoolId, Username } as AdminDeleteUserRequest;
      const command = new AdminDeleteUserCommand(input);
      console.log(`Demolishing users from userpool related to entity ${this.entityId} - ${JSON.stringify(input, null, 2)}`);
      if(this._dryRun) {
        return new Promise((resolve) => resolve('dryrun'));
      }
      return await cognitoClient.send(command);
    }
    this._deletedUsers.forEach((user) => {
      deleteUser(user.sub)
        .then(() => {
          console.log('User deleted');
        })
        .catch((reason) => {
          JSON.stringify(reason, Object.getOwnPropertyNames(reason), 2);
        });
    });
  }

  public demolish = async ():Promise<any> => {

    await this.deleteEntityFromDatabase();

    await this.deleteEntityFromUserPool();
  }

  public get entity(): Entity {
    return this._entity;
  }

  public get deletedUsers(): User[] {
    return this._deletedUsers;
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
}

