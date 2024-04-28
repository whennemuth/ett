import { AttributeValue, DeleteItemCommand, DeleteItemCommandInput, DeleteItemCommandOutput, DynamoDBClient, GetItemCommand, GetItemCommandInput, GetItemCommandOutput, PutItemCommand, PutItemCommandOutput, QueryCommand, QueryCommandInput, TransactWriteItemsCommand, TransactWriteItemsCommandInput, TransactWriteItemsCommandOutput, UpdateItemCommand, UpdateItemCommandInput, UpdateItemCommandOutput } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { DAOFactory, DAOUser } from './dao';
import { convertFromApiObject } from './db-object-builder';
import { Builder, getUpdateCommandBuilderInstance } from './db-update-builder';
import { Roles, User, UserFields, YN } from './entity';

/**
 * Basic CRUD operations for the dynamodb table behind the user base.
 * @param {*} userinfo 
 * @returns 
 */
export function UserCrud(userinfo:User, _dryRun:boolean=false): DAOUser {

  const dbclient = new DynamoDBClient({ region: process.env.REGION });
  const TableName = process.env.DYNAMODB_USER_TABLE_NAME || '';
  const TableEntityIndex = process.env.DYNAMODB_USER_ENTITY_INDEX || '';

  let { email, entity_id, role, sub, active=YN.Yes, create_timestamp=(new Date().toISOString()), 
    fullname, phone_number, title } = userinfo;

  let command:any;
  
  /**
   * @returns An instance of UserCrud with the same configuration that is in "dryrun" mode. That is, when any
   * operation, like read, update, query, etc is called, the command is withheld from being issued to dynamodb
   * and is returned instead.
   */
  const dryRun = () => {
    return UserCrud(userinfo, true);
  }

  const throwMissingError = (task:string, fld:string) => {
    throw new Error(`User ${task} error: Missing ${fld} in ${JSON.stringify(userinfo, null, 2)}`)
  }

  /**
   * Create a new user.
   * @returns 
   */
  const create = async (): Promise<PutItemCommandOutput> => {
    console.log(`Creating ${role}: ${fullname}`);

    // Handle required field validation
    if( ! entity_id) throwMissingError('create', UserFields.entity_id);
    if( ! role) throwMissingError('create', UserFields.role);
    if( role != Roles.SYS_ADMIN) {
      if( ! fullname ) throwMissingError('create', UserFields.fullname);
    }
    if( ! sub ) throwMissingError('create', UserFields.sub);

    // Make sure the original userinfo object gets a create_timestamp value if a default value is invoked.
    if( ! userinfo.create_timestamp) userinfo.create_timestamp = create_timestamp;
    
    const ItemToCreate = {
      [UserFields.email]: { S: email }, 
      [UserFields.entity_id]: { S: entity_id }, 
      [UserFields.sub]: { S: sub },
      [UserFields.role]: { S: role },
      // https://aws.amazon.com/blogs/database/working-with-date-and-timestamp-data-types-in-amazon-dynamodb/
      [UserFields.create_timestamp]: { S: create_timestamp},
      [UserFields.update_timestamp]: { S: create_timestamp},
      [UserFields.active]: { S: active },
    } as any

    // Add non-required fields
    if(fullname) ItemToCreate[UserFields.fullname] = { S: fullname };
    if(title) ItemToCreate[UserFields.title] = { S: title };
    if(phone_number) ItemToCreate[UserFields.phone_number] = { S: phone_number };

    // Send the command
    command = new PutItemCommand({ TableName, Item: ItemToCreate });
    return await sendCommand(command);
  }

  const read = async ():Promise<(User|null)|User[]> => {
    if(email && entity_id) {
      return await _read() as User;
    }
    else if(email) {
      return await _query({ v1: email, index: null } as IdxParms) as User[];
    }
    else {
      return await _query({ v1: entity_id, index: TableEntityIndex } as IdxParms) as User[];
    }
  }

  /**
   * Get a single record for a user in association with a specific registered entity.
   * @returns 
   */
  const _read = async ():Promise<User|null> => {
    console.log(`Reading user ${email} / ${entity_id}`);
    const params = {
      TableName,
      ConsistentRead: true,
      Key: { 
        [UserFields.email]: { S: email, },
        [UserFields.entity_id]: { S: entity_id }
      }
    } as GetItemCommandInput;
    command = new GetItemCommand(params);
    const retval:GetItemCommandOutput = await sendCommand(command);
    return await loadUser(retval.Item) as User;
  }

  /**
   * Retrieve potentially:
   *   1) Multiple instances of a specific user across multiple entities 
   *   or...
   *   2) Multiple instances of the different users within a single entity.
   * @returns 
   */
  type IdxParms = { v1:string; index:string|null }
  const _query = async (idxParms:IdxParms):Promise<User[]> => {
    const { v1, index } = idxParms;
    const key = TableEntityIndex == index ? UserFields.entity_id : UserFields.email;
    console.log(`Reading users for ${key}: ${v1}`);
    const params = {
      TableName,
      // ConsistentRead: true,
      ExpressionAttributeValues: {
        ':v1': { S: v1 }
      },
      KeyConditionExpression: `${key} = :v1`
    } as QueryCommandInput;

    if(index) {
      params.IndexName = index;
    }
    command = new QueryCommand(params);
    const retval = await sendCommand(command);
    const users = [] as User[];
    for(const item in retval.Items) {
      users.push(await loadUser(retval.Items[item]));
    }
    return users as User[];
  }

  /**
   * Update a specific users record at a specific registered entity.
   * NOTE: Only those fields that are not undefined from the destructuring of userinfo will be updated.
   * @returns 
   */
  const update = async ():Promise<UpdateItemCommandOutput> => {    
    // Handle field validation
    if( ! email) {
      throwMissingError('update', UserFields.email);
    }
    if( ! entity_id) {
      throwMissingError('update', UserFields.entity_id);
    }
    if( Object.keys(userinfo).length == 2 ) {
      throw new Error(`User update error: No fields to update for ${entity_id}: ${email}`);
    }
    console.log(`Updating user: ${email} / ${entity_id}`);
    const builder:Builder = getUpdateCommandBuilderInstance(userinfo, 'user', TableName);
    const input:UpdateItemCommandInput = builder.buildUpdateItem();
    command = new UpdateItemCommand(input);
    return await sendCommand(command);
  }

  /**
   * Migrate a user from one entity to another.
   * Since this involves modifying the key, the item must be deleted and re-added with the modified entity_id 
   * key value. This therefore performed in a transaction.
   * @param old_entity_id 
   * @returns 
   */
  const migrate = async (old_entity_id:string):Promise<TransactWriteItemsCommandOutput|undefined> => {
    // Read the existing user from the database to obtain ALL its attributes.
    const daoUser = DAOFactory.getInstance({ 
      DAOType:'user', 
      Payload:{ email, entity_id:old_entity_id } as User
    });
    const user = await daoUser.read() as User;

    // Modify the attributes that need to change (entity_id, update_timestamp)
    user.entity_id = entity_id;
    user.update_timestamp = new Date().toISOString();

    if( ! email) {
      throw new Error(`User migrate error: Missing email to migrate in: ${JSON.stringify(userinfo, null, 2)}`);
    }

    if( ! entity_id) {
      throw new Error(`User migrate error: Missing migration target entity_id in: ${JSON.stringify(userinfo, null, 2)}`);
    }

    // Define the transaction to execute (delete of original user followed by put of same user in different entity)
    const Key = marshall({ [ UserFields.email ]: email, [ UserFields.entity_id ]: old_entity_id }) as Record<string, AttributeValue>;
    const Item = marshall(user);
    const input = {
      TransactItems: [
        { Delete: { TableName, Key } },
        // The condition expression might be a bit superfluous since any matching item would have just been deleted.
        { Put: { TableName, Item, ConditionExpression: 'attribute_not_exists(entity_id)' } }
      ]
    } as TransactWriteItemsCommandInput;
    
    // Execute the transaction
    const transCommand = new TransactWriteItemsCommand(input);
    return await dbclient.send(transCommand); 
  }

  /**
   * Delete the user from the dynamodb table.
   * NOTE: If the sort key (entity_id) is undefined, ALL records with email will be deleted.
   * This is probably not a function you want to expose too publicly, favoring a deactivate method in client
   * code that calls the update function to toggle the active field to "N".
   */
  const Delete = async ():Promise<DeleteItemCommandOutput> => {

    // Handle missing field validation
    if( ! email) throwMissingError('delete', UserFields.email);
    if( ! entity_id) throwMissingError('delete', UserFields.entity_id);

    const input = {
      TableName,
      Key: { 
        [UserFields.email]: { S: email, },
      } as Record<string, AttributeValue>
    } as DeleteItemCommandInput;

    if(hasSortKey() && input.Key) {
      // Add the sort key. Only one item will be deleted.
      input.Key[UserFields.entity_id] = { S: entity_id };
    }
    command = new DeleteItemCommand(input);
    return await sendCommand(command);
  }

  /**
   * Delete all users that belong to the specified entity
   * @returns
   */
  const deleteEntity = async ():Promise<DeleteItemCommandOutput> => {

    // Handle missing field validation
    if( ! entity_id) throwMissingError('delete-entity', UserFields.entity_id);

    const input = {
      TableName,
      Key: { 
        [UserFields.entity_id]: { S: entity_id, },
      } as Record<string, AttributeValue>
    } as DeleteItemCommandInput;
    command = new DeleteItemCommand(input);
    return await sendCommand(command);
  }

  const hasSortKey = () => { return userinfo.entity_id || false; }

  const loadUser = async (user:any):Promise<User> => {
    return new Promise( resolve => {
      resolve(convertFromApiObject(user) as User);
    });
  }

  /**
   * Envelope the clientdb send function with error handling.
   * @param command 
   * @returns 
   */
  const sendCommand = async (command:any): Promise<any> => {
    let response;
    try {
      if(_dryRun) {
        response = command;
      }
      else {
        response = await dbclient.send(command);
      }           
    }
    catch(e) {
      console.error(e);
    }          
    return response;
  }

  const test = async () => {
    await read();
  }
  
  return { create, read, update, migrate, Delete, deleteEntity, dryRun, test, } as DAOUser
}