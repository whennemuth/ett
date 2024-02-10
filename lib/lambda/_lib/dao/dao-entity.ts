import { DeleteItemCommand, DeleteItemCommandInput, DeleteItemCommandOutput, DynamoDBClient, GetItemCommand, GetItemCommandInput, GetItemCommandOutput, UpdateItemCommand, UpdateItemCommandInput, UpdateItemCommandOutput } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { DAOEntity } from './dao';
import { convertFromApiObject } from './db-object-builder';
import { Builder, getUpdateCommandBuilderInstance } from './db-update-builder';
import { Entity, EntityFields, YN } from './entity';

export const ENTITY_WAITING_ROOM:string = '__UNASSIGNED__';

const dbclient = new DynamoDBClient({ region: process.env.REGION });

export function EntityCrud(entityInfo:Entity): DAOEntity {

  let { entity_id, entity_name, create_timestamp, update_timestamp, active=YN.Yes } = entityInfo;

  const throwMissingError = (task:string, fld:string) => {
    throw new Error(`Entity ${task} error: Missing ${fld} in ${JSON.stringify(entityInfo, null, 2)}`)
  }

  /**
   * Create a new entity.
   * @returns 
   */
  const create = async (): Promise<UpdateItemCommandOutput> => {
    // Handle missing field validation
    if( ! entity_name) throwMissingError('create', EntityFields.entity_name);

    console.log(`Creating entity: ${entity_name}`);

    // If an entity id is not provided, generate one.
    if( ! entity_id) {
      entity_id = uuidv4();
      entityInfo.entity_id = entity_id;
    }
    // Make sure timestamps have values.
    if( ! create_timestamp) {
      create_timestamp = new Date().toISOString();
      entityInfo.create_timestamp = create_timestamp;
    }
    if( ! update_timestamp) {
      update_timestamp = create_timestamp;
      entityInfo.update_timestamp = update_timestamp;
    }
    
    const builder:Builder = getUpdateCommandBuilderInstance(entityInfo, process.env.DYNAMODB_ENTITY_TABLE_NAME || '');
    const input:UpdateItemCommandInput = builder.buildUpdateItem();
    const command = new UpdateItemCommand(input);
    return await sendCommand(command);
  }

  /**
   * Get a single entity record associated with the specified primary key value (entity_id)
   * @returns 
   */
  const read = async ():Promise<Entity|null> => {
    // Handle missing field validation
    if( ! entity_id) throwMissingError('read', EntityFields.entity_id);

    console.log(`Reading ${entity_id}`);
    const params = {
      TableName: process.env.DYNAMODB_ENTITY_TABLE_NAME,
      Key: {
        [EntityFields.entity_id]: { S: entity_id }
      }
    } as GetItemCommandInput
    const command = new GetItemCommand(params);
    const retval:GetItemCommandOutput = await sendCommand(command);
    if( ! retval.Item) {
      return null;
    }
    return await loadUser(retval.Item) as Entity;
  }

  /**
   * Update a specific entity record associated with the specified primary key (entity_id)
   */
  const update = async ():Promise<UpdateItemCommandOutput> => {
    // Handle field validation
    if( ! entity_id) {
      throwMissingError('update', EntityFields.entity_id);
    }
    if( Object.keys(entityInfo).length == 1 ) {
      throw new Error(`Entity update error: No fields to update for ${entity_id}`);
    }
    console.log(`Updating entity: ${entity_id}`);
    const builder:Builder = getUpdateCommandBuilderInstance(entityInfo, process.env.DYNAMODB_ENTITY_TABLE_NAME || '');
    const input:UpdateItemCommandInput = builder.buildUpdateItem();
    const command = new UpdateItemCommand(input);
    return await sendCommand(command);
  }

  /**
   * Delete an entity from the dynamodb table.
   * This is probably not a function you want to expose too publicly, favoring a deactivate method in client
   * code that calls the update function to toggle the active field to "N".
   */
  const Delete = async ():Promise<DeleteItemCommandOutput> => {
    const input = {
      TableName: process.env.DYNAMODB_USER_TABLE_NAME,
      Key: { 
         [EntityFields.entity_id]: { S: entity_id, },
      },
    } as DeleteItemCommandInput;
    const command = new DeleteItemCommand(input);
    return await sendCommand(command);
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

  const loadUser = async (entity:any):Promise<Entity> => {
    return new Promise( resolve => {
      resolve(convertFromApiObject(entity) as Entity);
    });
  }

  const id = ():string => {
    return entity_id;
  }

  const test = async () => {
    await read();
  }

  return { create, read, update, Delete, id, test, } as DAOEntity;
}

