import { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand, UpdateItemCommand, AttributeValue, UpdateItemCommandInput, DeleteItemCommand } from '@aws-sdk/client-dynamodb'
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

  const { email, entity_name, role='', sub='', fullname='', active=YN.Yes } = userinfo;

  const throwMissingError = (task:string, fld:string) => {
    throw new Error(`User ${task} error: Missing ${fld} in ${JSON.stringify(userinfo, null, 2)}`)
  }

  /**
   * Create a new user.
   * @returns 
   */
  const create = async () => {
    console.log(`Creating ${role}: ${fullname}`);

    // Handle missing field validation
    if( ! entity_name) throwMissingError('create', UserFields.entity_name);
    if( ! role) throwMissingError('create', UserFields.role);
    if( ! fullname ) throwMissingError('create', UserFields.fullname);
    if( ! sub ) throwMissingError('create', UserFields.sub);

    // Send the command
    const dte = new Date().toISOString();
    const params = {
      TableName: process.env.DYNAMODB_USER_TABLE_NAME,
      Item: { 
        [UserFields.email]: { S: email }, 
        [UserFields.entity_name]: { S: entity_name }, 
        [UserFields.fullname]: { S: fullname },
        [UserFields.sub]: { S: sub },
        [UserFields.role]: { S: role },
        // https://aws.amazon.com/blogs/database/working-with-date-and-timestamp-data-types-in-amazon-dynamodb/
        [UserFields.create_timestamp]: { S: dte},
        [UserFields.update_timestamp]: { S: dte},
        [UserFields.active]: { S: active },
      }
    };
    const command = new PutItemCommand(params);
    return await sendCommand(command);
  }

  const read = async ():Promise<User|User[]> => {
    if(entity_name) {
      return await _read() as User;
    }
    else {
      return await _query() as User[];
    }
  }

  /**
   * Get a single record for a user in association with a specific registered entity.
   * @returns 
   */
  const _read = async ():Promise<User> => {
    console.log(`Reading ${email} / ${entity_name}`);
    const params = {
      TableName: process.env.DYNAMODB_USER_TABLE_NAME,
      Key: { 
        [UserFields.email]: { S: email, },
        [UserFields.entity_name]: { S: entity_name }
      }
    };
    const command = new GetItemCommand(params);
    const retval = await sendCommand(command);
    return await loadUser(retval.Item) as User;
  }

  /**
   * Retrieve potentially more than one record for a user by email address.
   * That is, without specifying the sort key (entity_name), you could get multiple entries for the user across different entities.
   * @returns 
   */
  const _query = async ():Promise<User[]> => {
    console.log(`Reading ${email}`);
    const params = {
      TableName: process.env.DYNAMODB_USER_TABLE_NAME,
      ExpressionAttributeValues: {
        ':v1': { S: email }
      },
      KeyConditionExpression: `${UserFields.email} = :v1`
    };
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
  const update = async ():Promise<any> => {    
    // Handle field validation
    if( ! entity_name) {
      throwMissingError('update', UserFields.entity_name);
    }
    else if( Object.keys(userinfo).length == 2 ) {
      throw new Error(`User update error: No fields to update for ${entity_name}: ${email}`);
    }
    console.log(`Updating user: ${email} / ${entity_name}`);
    const builder:Builder = getUpdateCommandBuilderInstance(userinfo, process.env.DYNAMODB_USER_TABLE_NAME || '');
    const input:UpdateItemCommandInput = builder.buildUpdateItem();
    const command = new UpdateItemCommand(input);
    return await sendCommand(command);
  }

  /**
   * Delete the user from the dynamodb table.
   * NOTE: If the sort key (entity_name) is undefined, ALL records with email will be deleted.
   * This is probably not a function you want to expose too publicly, favoring a deactivate method in client
   * code that calls the update function to toggle the active field to "N".
   */
  const Delete = async () => {

    // Handle missing field validation
    if( ! entity_name) throwMissingError('delete', UserFields.entity_name);

    const input = {
      TableName: process.env.DYNAMODB_USER_TABLE_NAME,
      Key: { 
        [UserFields.email]: { S: email, },
        [UserFields.entity_name]: { S: entity_name, },
      }
    };

    if(hasSortKey()) {
      // Add the sort key. Only one item will be deleted.
      Object.defineProperty(input.Key, UserFields.entity_name, { S: entity_name } as AttributeValue);
    }
    const command = new DeleteItemCommand(input);
    return await sendCommand(command);
  }

  const hasSortKey = () => { return userinfo.entity_name || false; }

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