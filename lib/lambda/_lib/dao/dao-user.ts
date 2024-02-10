import { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand, UpdateItemCommand, AttributeValue, UpdateItemCommandInput, DeleteItemCommand, GetItemCommandInput, GetItemCommandOutput, UpdateItemCommandOutput, DeleteItemCommandInput, DeleteItemCommandOutput, QueryCommandInput, PutItemCommandOutput } from '@aws-sdk/client-dynamodb'
import { User, UserFields, YN } from './entity';
import { Builder, getUpdateCommandBuilderInstance } from './db-update-builder'; 
import { convertFromApiObject } from './db-object-builder';
import { DAOUser } from './dao';

const dbclient = new DynamoDBClient({ region: process.env.REGION });

/**
 * Basic CRUD operations for the dynamodb table behind the user base.
 * @param {*} userinfo 
 * @returns 
 */
export function UserCrud(userinfo:User): DAOUser {

  let { email, entity_id, role, sub, fullname='', active=YN.Yes, create_timestamp } = userinfo;

  const throwMissingError = (task:string, fld:string) => {
    throw new Error(`User ${task} error: Missing ${fld} in ${JSON.stringify(userinfo, null, 2)}`)
  }

  /**
   * Create a new user.
   * @returns 
   */
  const create = async (): Promise<PutItemCommandOutput> => {
    console.log(`Creating ${role}: ${fullname}`);

    // Handle missing field validation
    if( ! entity_id) throwMissingError('create', UserFields.entity_id);
    if( ! role) throwMissingError('create', UserFields.role);
    if( ! fullname ) throwMissingError('create', UserFields.fullname);
    if( ! sub ) throwMissingError('create', UserFields.sub);

    // Send the command
    if( ! create_timestamp) {
      create_timestamp = new Date().toISOString();
      userinfo.create_timestamp = create_timestamp;
    }
    const params = {
      TableName: process.env.DYNAMODB_USER_TABLE_NAME,
      Item: { 
        [UserFields.email]: { S: email }, 
        [UserFields.entity_id]: { S: entity_id }, 
        [UserFields.fullname]: { S: fullname },
        [UserFields.sub]: { S: sub },
        [UserFields.role]: { S: role },
        // https://aws.amazon.com/blogs/database/working-with-date-and-timestamp-data-types-in-amazon-dynamodb/
        [UserFields.create_timestamp]: { S: create_timestamp},
        [UserFields.update_timestamp]: { S: create_timestamp},
        [UserFields.active]: { S: active },
      }
    };
    const command = new PutItemCommand(params);
    return await sendCommand(command);
  }

  const read = async ():Promise<(User|null)|User[]> => {
    if(email && entity_id) {
      return await _read() as User;
    }
    else if( ! email && ! entity_id) {
      return await _read() as User;
    }
    else if(email) {
      return await _query({ v1: email, index: null } as IdxParms) as User[];
    }
    else {
      return await _query({ v1: entity_id, index: 'EntityIndex' } as IdxParms) as User[];
    }
  }

  /**
   * Get a single record for a user in association with a specific registered entity.
   * @returns 
   */
  const _read = async ():Promise<User|null> => {
    console.log(`Reading ${email} / ${entity_id}`);
    const params = {
      TableName: process.env.DYNAMODB_USER_TABLE_NAME,
      ConsistentRead: true,
      Key: { 
        [UserFields.email]: { S: email, },
        [UserFields.entity_id]: { S: entity_id }
      }
    } as GetItemCommandInput;
    const command = new GetItemCommand(params);
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
    console.log(`Reading users for ${v1}`);
    const params = {
      TableName: process.env.DYNAMODB_USER_TABLE_NAME,
      ConsistentRead: true,
      ExpressionAttributeValues: {
        ':v1': { S: v1 }
      },
      KeyConditionExpression: `${UserFields.email} = :v1`
    } as QueryCommandInput;

    if(index) {
      params.IndexName = index;
    }
    const command = new QueryCommand(params);
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
    if( ! entity_id) {
      throwMissingError('update', UserFields.entity_id);
    }
    if( Object.keys(userinfo).length == 2 ) {
      throw new Error(`User update error: No fields to update for ${entity_id}: ${email}`);
    }
    console.log(`Updating user: ${email} / ${entity_id}`);
    const builder:Builder = getUpdateCommandBuilderInstance(userinfo, process.env.DYNAMODB_USER_TABLE_NAME || '');
    const input:UpdateItemCommandInput = builder.buildUpdateItem();
    const command = new UpdateItemCommand(input);
    return await sendCommand(command);
  }

  /**
   * Delete the user from the dynamodb table.
   * NOTE: If the sort key (entity_id) is undefined, ALL records with email will be deleted.
   * This is probably not a function you want to expose too publicly, favoring a deactivate method in client
   * code that calls the update function to toggle the active field to "N".
   */
  const Delete = async ():Promise<DeleteItemCommandOutput> => {

    // Handle missing field validation
    if( ! entity_id) throwMissingError('delete', UserFields.entity_id);

    const input = {
      TableName: process.env.DYNAMODB_USER_TABLE_NAME,
      Key: { 
        [UserFields.email]: { S: email, },
      } as Record<string, AttributeValue>
    } as DeleteItemCommandInput;

    if(hasSortKey() && input.Key) {
      // Add the sort key. Only one item will be deleted.
      input.Key[UserFields.entity_id] = { S: entity_id };
    }
    const command = new DeleteItemCommand(input);
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
      response = await dbclient.send(command);
    }
    catch(e) {
      console.error(e);
    }          
    return response;
  }

  const test = async () => {
    await read();
  }
  
  return { create, read, update, Delete, test, } as DAOUser
}