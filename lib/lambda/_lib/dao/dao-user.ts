import { AttributeValue, DeleteItemCommand, DeleteItemCommandInput, DeleteItemCommandOutput, DynamoDBClient, GetItemCommand, GetItemCommandInput, GetItemCommandOutput, QueryCommand, QueryCommandInput, TransactWriteItemsCommand, TransactWriteItemsCommandInput, TransactWriteItemsCommandOutput, UpdateItemCommand, UpdateItemCommandInput, UpdateItemCommandOutput } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { DynamoDbConstruct, IndexBaseNames, TableBaseNames } from '../../../DynamoDb';
import { DAOFactory, DAOUser, ReadParms } from './dao';
import { convertFromApiObject } from './db-object-builder';
import { userUpdate } from './db-update-builder.user';
import { Roles, User, UserFields, YN } from './entity';

export type UserCrudParams = {
  userinfo:User, _dryRun?:boolean, removableDelegate?:boolean
}

/**
 * Basic CRUD operations for the dynamodb table behind the user base.
 * @param {*} userinfo 
 * @returns 
 */
export function UserCrud(parms:UserCrudParams): DAOUser {
  const { userinfo, _dryRun=false, removableDelegate=false } = parms;
  const dbclient = new DynamoDBClient({ region: process.env.REGION });
  const { getTableName } = DynamoDbConstruct;
  const { USERS } = TableBaseNames;
  const { USERS_ENTITY } = IndexBaseNames;
  const TableName = getTableName(USERS);

  if(userinfo.email) {
    userinfo.email = userinfo.email.toLowerCase();
  }

  let { email, entity_id, role, sub, active=YN.Yes, create_timestamp=(new Date().toISOString()), 
    fullname } = userinfo;

  let command:any;
  
  /**
   * @returns An instance of UserCrud with the same configuration that is in "dryrun" mode. That is, when any
   * operation, like read, update, query, etc is called, the command is withheld from being issued to dynamodb
   * and is returned instead.
   */
  const dryRun = () => {
    return UserCrud({ userinfo, _dryRun:true });
  }

  const throwMissingError = (task:string, fld:string) => {
    throw new Error(`User ${task} error: Missing ${fld} in ${JSON.stringify(userinfo, null, 2)}`)
  }

  /**
   * Create a new user.
   * @returns 
   */
  const create = async (): Promise<UpdateItemCommandOutput> => {
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

    // Make sure the original userinfo object gets an active value if a default value is invoked.
    if( ! userinfo.active) userinfo.active = active;
    
    console.log(`Creating user: ${email} / ${entity_id}`);
    const input = userUpdate(TableName, userinfo).buildUpdateItemCommandInput() as UpdateItemCommandInput;
    command = new UpdateItemCommand(input);
    return await sendCommand(command);
  }

  const read = async (readParms?:ReadParms):Promise<(User|null)|User[]> => {
    if(email && entity_id) {
      return await _read(readParms) as User;
    }
    else if(email) {
      return await _query({ v1: email, index: null } as IdxParms, readParms) as User[];
    }
    else {
      return await _query({ v1: entity_id, index: USERS_ENTITY } as IdxParms, readParms) as User[];
    }
  }

  /**
   * Get a single record for a user in association with a specific registered entity.
   * @returns 
   */
  const _read = async (readParms?:ReadParms):Promise<User|null> => {
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
    const { convertDates } = (readParms ?? {});
    return await loadUser(retval.Item, convertDates ?? true) as User;
  }

  /**
   * Retrieve potentially:
   *   1) Multiple instances of a specific user across multiple entities 
   *   or...
   *   2) Multiple instances of the different users within a single entity.
   * @returns 
   */
  type IdxParms = { v1:string; index:string|null }
  const _query = async (idxParms:IdxParms, readParms?:ReadParms):Promise<User[]> => {
    const { v1, index } = idxParms;
    const key = USERS_ENTITY == index ? UserFields.entity_id : UserFields.email;
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
    const { convertDates } = (readParms ?? {});
    for(const item in retval.Items) {
      users.push(await loadUser(retval.Items[item], convertDates ?? true));
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
    const input = userUpdate(TableName, userinfo, removableDelegate).buildUpdateItemCommandInput() as UpdateItemCommandInput;
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
    const user = await daoUser.read({ convertDates: false }) as User;

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

  const loadUser = async (user:any, convertDates:boolean):Promise<User> => {
    return new Promise( resolve => {
      resolve(convertFromApiObject(user, convertDates) as User);
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



/**
 * RUN MANUALLY
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/dao/dao-user.ts')) {

  const user = {
    email: 'testing@testing.com',
    entity_id: 'test-entity-ID',
    role: Roles.RE_AUTH_IND,
    sub: 'abc-123',
    fullname: 'Bart Simpson',
    phone_number: '+1234567890',
    title: 'Prankster',
    active: YN.Yes
  } as User;

  const task = 'create' as 'create' | 'update' | 'read' | 'delete' | 'migrate';

  (async () => {
    switch(task) {
      case 'create':
        await UserCrud({ userinfo:user }).create();
        break;
      case 'update':
        await UserCrud({ userinfo:user }).update();
        break;
      case 'read':
      case 'delete':
      case 'migrate':
    }
  })();
}
