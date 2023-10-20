import { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand, UpdateItemCommand, AttributeValue } from '@aws-sdk/client-dynamodb'
import { User, UserFields, YN } from './entity';
import { Builder, getBuilderInstance } from './builder'; 

const dbclient = new DynamoDBClient({ region: process.env.REGION });

export type DAO = { create(): any; read(): any; update(): any; query(): any; _delete(): any; test(): any };

export class DAOFactory {
  constructor() { }
  public static getInstance(userinfo:any): DAO {
    return crud(userinfo);
  }
}

/**
 * Basic CRUD operations for the dynamodb table behind the user base.
 * @param {*} userinfo 
 * @returns 
 */
export function crud(userinfo:User): DAO {

  const { email, entity_name, role="", fullname="", active=YN.Yes } = userinfo;

  /**
   * Create a new user.
   * @returns 
   */
  const create = async () => {
    console.log(`Creating ${role}: ${fullname}`);
    if( ! role ) {
      throw new Error(`User create error! Role is missing for ${email}/${entity_name}`);
    }
    if( ! fullname ) {
      throw new Error(`User create error! Fullname is missing for ${email}/${entity_name}`);
    }
    const dte = new Date().toISOString();
    const params = {
      TableName: process.env.DYNAMODB_USER_TABLE_NAME,
      Item: { 
        email: { S: email }, 
        entity_name: { S: entity_name }, 
        fullname: { S: fullname },
        role: { S: role },
        create_timestamp: { S: dte},
        update_timestamp: { S: dte},
        active: { S: active },
      }
    };
    const command = new PutItemCommand(params);
    return sendCommand(command);
  }

  /**
   * Get a single record for a user in association with a specific registered entity.
   * @returns 
   */
  const read = async () => {
    console.log(`Reading ${email} / ${entity_name}`);
    const params = {
      TableName: process.env.DYNAMODB_USER_TABLE_NAME,
      Key: { 
        email: { S: email, },
        entity_name: { S: entity_name }
      }
    };
    const command = new GetItemCommand(params);
    return sendCommand(command);
  }

  /**
   * Retrieve potentially more than one record for a user by email address.
   * That is, without specifying the sort key (entity_name), you could get multiple entries for the user across different entities.
   * @returns 
   */
  const query = async () => {
    console.log(`Reading ${email}`);
    const params = {
      TableName: process.env.DYNAMODB_USER_TABLE_NAME,
      ExpressionAttributeValues: {
        ':v1': { S: email }
      },
      KeyConditionExpression: `${UserFields.email} = :v1`
    };
    const command = new QueryCommand(params);
    return sendCommand(command);
  }

  /**
   * Update a specific users record at a specific registered entity.
   * NOTE: Only those fields that are not undefined from the destructuring of userinfo will be updated.
   * @returns 
   */
  const update = async () => {
    console.log(`Updating ${email} / ${entity_name}`);
    const builder:Builder = getBuilderInstance(userinfo, process.env.DYNAMODB_USER_TABLE_NAME || '');
    const input = builder.buildUpdateItem();
    const command = new UpdateItemCommand(input);
    return sendCommand(command);
  }

  /**
   * Delete the user from the dynamodb table.
   * NOTE: If the sort key (entity_name) is undefined, ALL records with email will be deleted.
   * This is probably not a function you want to expose too publicly, favoring a deactivate method in client
   * code that calls the update function to toggle the active field to "N".
   */
  const _delete = async () => {

  }

  /**
   * Embellish the clientdb send function with error handling.
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

  const test = () => {
    // Not async ok?
    read();
  }
  
  return {
    create, read, update, _delete, query, test,
  }
}
