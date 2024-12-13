import { DeleteItemCommand, DeleteItemCommandInput, DeleteItemCommandOutput, DynamoDBClient, GetItemCommand, GetItemCommandInput, GetItemCommandOutput, QueryCommand, QueryCommandInput, UpdateItemCommand, UpdateItemCommandInput, UpdateItemCommandOutput } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDbConstruct, IndexBaseNames, TableBaseNames } from '../../../DynamoDb';
import { DAOEntity, ReadParms } from './dao';
import { convertFromApiObject } from './db-object-builder';
import { entityUpdate } from './db-update-builder.entity';
import { Entity, EntityFields, YN } from './entity';

export const ENTITY_WAITING_ROOM:string = '__UNASSIGNED__';

export function EntityCrud(entityInfo:Entity, _dryRun:boolean=false): DAOEntity {

  const dbclient = new DynamoDBClient({ region: process.env.REGION });
  const { getTableName } = DynamoDbConstruct;
  const { ENTITIES } = TableBaseNames;
  const { ENTITIES_ACTIVE, ENTITIES_NAME_LOWER } = IndexBaseNames;
  const TableName = getTableName(ENTITIES);
  const TableActiveIndex = ENTITIES_ACTIVE;
  const TableNameIndex = ENTITIES_NAME_LOWER;

  let { entity_id, entity_name, entity_name_lower, create_timestamp, update_timestamp, active } = entityInfo;

  let command:any;
  
  /**
   * @returns An instance of EntityCrud with the same configuration that is in "dryrun" mode. That is, when any
   * operation, like read, update, query, etc is called, the command is withheld from being issued to dynamodb
   * and is returned instead 
   */
  const dryRun = () => {
    return EntityCrud(entityInfo, true);
  }


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
    // Set the lower-cased entity name
    entityInfo.entity_name_lower = entity_name.trim().toLowerCase();
    // Make sure timestamps have values.
    if( ! create_timestamp) {
      create_timestamp = new Date().toISOString();
      entityInfo.create_timestamp = create_timestamp;
    }
    if( ! update_timestamp) {
      update_timestamp = create_timestamp;
      entityInfo.update_timestamp = update_timestamp;
    }
    if( ! active) {
      active = YN.Yes;
      entityInfo.active = active;
    }

    const input = entityUpdate(TableName, entityInfo).buildUpdateItemCommandInput() as UpdateItemCommandInput;
    command = new UpdateItemCommand(input);
    return await sendCommand(command);
  }

  const read = async (readParms?:ReadParms):Promise<(Entity|null)|Entity[]> => {
    if(entity_id) {
      return await _read(readParms) as Entity;
    }
    else if(entity_name_lower) {
      return await _queryName(readParms) as Entity[]
    }
    else if(active) {
      return await _queryActive(active, readParms) as Entity[];
    }
    else {
      return await _queryAll(readParms) as Entity[];
    }
  }

  /**
   * Get a single entity record associated with the specified primary key value (entity_id)
   * @returns 
   */
  const _read = async (readParms?:ReadParms):Promise<Entity|null> => {
    // Handle missing field validation
    if( ! entity_id) throwMissingError('read', EntityFields.entity_id);

    console.log(`Reading entity ${entity_id}`);
    const params = {
      TableName,
      Key: {
        [EntityFields.entity_id]: { S: entity_id }
      }
    } as GetItemCommandInput
    command = new GetItemCommand(params);
    const retval:GetItemCommandOutput = await sendCommand(command);
    if( ! retval.Item) {
      return null;
    }
    const { convertDates } = (readParms ?? {});
    return await loadEntity(retval.Item, convertDates ?? true) as Entity;
  }

  /**
   * Query for all items regardless of activity status
   * @param readParms 
   * @returns 
   */
  const _queryAll = async (readParms?:ReadParms):Promise<Entity[]> => {
    const all = [] as Entity[];
    const active = await _queryActive(YN.Yes);
    all.push(...active);
    const inactive = await _queryActive(YN.No);
    all.push(...inactive);
    return all;
  }

  /**
   * Query for items by their activity status
   * @param v1 
   * @param readParms 
   * @returns 
   */
  const _queryActive = async (v1:string, readParms?:ReadParms):Promise<Entity[]> => {
    const key = EntityFields.active; // set to the partion key of the secondary index
    console.log(`Reading entities for ${key}: ${v1}`);
    const params = {
      TableName,
      // ConsistentRead: true,
      ExpressionAttributeValues: {
        ':v1': { S: v1 }
      },
      KeyConditionExpression: `${key} = :v1`,
      IndexName: TableActiveIndex
    } as QueryCommandInput;
    command = new QueryCommand(params);
    const retval = await sendCommand(command);
    const entities = [] as Entity[];
    const { convertDates } = (readParms ?? {});
    for(const item in retval.Items) {
      entities.push(await loadEntity(retval.Items[item], convertDates ?? true));
    }
    return entities as Entity[];
  }

  /**
   * Query for items by their lower-cased name.
   * @param readParms 
   * @returns 
   */
  const _queryName = async (readParms?:ReadParms):Promise<Entity[]> => {
    const key = EntityFields.entity_name_lower; // set to the partion key of the secondary index
    console.log(`Reading entities for ${key}: ${entity_name_lower}`);
    const params = {
      TableName,
      // ConsistentRead: true,
      ExpressionAttributeValues: {
        ':v1': { S: entity_name_lower }
      },
      KeyConditionExpression: `${key} = :v1`,
      IndexName: TableNameIndex
    } as QueryCommandInput;
    command = new QueryCommand(params);
    const retval = await sendCommand(command);
    const entities = [] as Entity[];
    const { convertDates } = (readParms ?? {});
    for(const item in retval.Items) {
      entities.push(await loadEntity(retval.Items[item], convertDates ?? true));
    }
    return entities as Entity[];
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
    entityInfo.entity_name_lower = entity_name.trim().toLowerCase();
    console.log(`Updating entity: ${entity_id}`);
    const input = entityUpdate(TableName, entityInfo).buildUpdateItemCommandInput() as UpdateItemCommandInput;
    command = new UpdateItemCommand(input);
    return await sendCommand(command);
  }

  /**
   * Delete an entity from the dynamodb table.
   * This is probably not a function you want to expose too publicly, favoring a deactivate method in client
   * code that calls the update function to toggle the active field to "N".
   */
  const Delete = async ():Promise<DeleteItemCommandOutput> => {
    const input = {
      TableName,
      Key: { 
         [EntityFields.entity_id]: { S: entity_id, },
      },
    } as DeleteItemCommandInput;
    command = new DeleteItemCommand(input);
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

  const loadEntity = async (entity:any, convertDates:boolean):Promise<Entity> => {
    return new Promise( resolve => {
      resolve(convertFromApiObject(entity, convertDates) as Entity);
    });
  }

  const id = ():string => {
    return entity_id;
  }

  const test = async () => {
    await read();
  }

  return { create, read, update, Delete, id, dryRun, test, } as DAOEntity;
}

