import { BatchWriteItemCommand, BatchWriteItemInput, BatchWriteItemOutput, DeleteItemCommand, DeleteItemCommandInput, DeleteItemCommandOutput, DynamoDBClient, GetItemCommand, GetItemCommandInput, GetItemCommandOutput, ScanCommand, ScanInput, UpdateItemCommand, UpdateItemCommandInput, UpdateItemCommandOutput, WriteRequest } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { DynamoDbConstruct, TableBaseNames } from "../../../DynamoDb";
import { DAOConfig, ReadParms } from "./dao";
import { convertFromApiObject } from "./db-object-builder";
import { configUpdate } from "./db-update-builder.config";
import { Config, ConfigFields } from "./entity";


export function ConfigCrud(configInfo:Config, _dryRun:boolean=false): DAOConfig {

  const dbclient = new DynamoDBClient({ region: process.env.REGION });
  const { getTableName } = DynamoDbConstruct;
  const { CONFIG } = TableBaseNames;
  const TableName = getTableName(CONFIG);

  
  let { name, description, update_timestamp, value } = configInfo;
  
  let command:any;

  /**
   * @returns An instance of ConfigCrud with the same configuration that is in "dryrun" mode. That is, when any
   * operation, like read, update, query, etc is called, the command is withheld from being issued to dynamodb
   * and is returned instead 
   */
  const dryRun = () => {
    return ConfigCrud(configInfo, true);
  }

  const throwMissingError = (task:string, fld:string) => {
    throw new Error(`Config ${task} error: Missing ${fld} in ${JSON.stringify(configInfo, null, 2)}`)
  }

  /**
   * Create a new config entry.
   * @returns 
   */
  const create = async (): Promise<UpdateItemCommandOutput> => {
    // Handle missing field validation
    if( ! name) throwMissingError('create', ConfigFields.name);
    if( ! value) throwMissingError('create', ConfigFields.value);
    if( ! description) throwMissingError('create', ConfigFields.description);

    console.log(`Creating config: ${name}`);

    // Make sure update_timestamp has a value.
    if( ! update_timestamp) {
      update_timestamp = new Date().toISOString();
      configInfo.update_timestamp = update_timestamp;
    }

    const input = configUpdate(TableName, configInfo).buildUpdateItemCommandInput() as UpdateItemCommandInput;
    command = new UpdateItemCommand(input);
    return await sendCommand(command);
  }

  const read = async (readParms?:ReadParms):Promise<(Config|null)|Config[]> => {
    if(name) {
      return await _read(readParms) as Config;
    }
    else {
      return await _scan(readParms) as Config[];
    }
  }

  /**
   * Get a single config record associated with the specified primary key value (name)
   * @returns 
   */
  const _read = async (readParms?:ReadParms):Promise<Config|null> => {
    // Handle missing field validation
    if( ! name) throwMissingError('read', ConfigFields.name);

    console.log(`Reading config: ${name}`);
    const params = {
      TableName,
      Key: {
        [ConfigFields.name]: { S: name }
      }
    } as GetItemCommandInput
    command = new GetItemCommand(params);
    const retval:GetItemCommandOutput = await sendCommand(command);
    if( ! retval.Item) {
      return null;
    }
    const { convertDates } = (readParms ?? {});
    return await loadConfig(retval.Item, convertDates ?? true) as Config;
  }

  const _scan = async (readParms?:ReadParms):Promise<Config[]> => {
    console.log(`Scanning config table`);   
    const command = new ScanCommand({ TableName } as ScanInput);
    const retval = await sendCommand(command);
    const configs = [] as Config[];
    const { convertDates } = (readParms ?? {});
    for(const item in retval.Items) {
      configs.push(await loadConfig(retval.Items[item], convertDates ?? true));
    }
    return configs as Config[];
  }

  /**
   * Update a specific config record associated with the specified primary key (name)
   */
  const update = async ():Promise<UpdateItemCommandOutput> => {
    // Handle field validation
    if( ! name) {
      throwMissingError('update', ConfigFields.name);
    }
    if( Object.keys(configInfo).length == 1 ) {
      throw new Error(`Config update error: No fields to update for ${name}`);
    }
    console.log(`Updating config: ${name}`);
    const input = configUpdate(TableName, configInfo).buildUpdateItemCommandInput() as UpdateItemCommandInput;
    command = new UpdateItemCommand(input);
    return await sendCommand(command);
  }

  /**
   * Delete a config entry from the dynamodb table.
   */
  const Delete = async ():Promise<DeleteItemCommandOutput> => {
    const input = {
      TableName,
      Key: { 
         [ConfigFields.name]: { S: name, },
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

  const loadConfig = async (entity:any, convertDates:boolean):Promise<Config> => {
    return new Promise( resolve => {
      resolve(convertFromApiObject(entity, convertDates) as Config);
    });
  }

  const test = async () => {
    await read();
  }

  return { create, read, update, Delete, dryRun, test, } as DAOConfig;
}


export type DAOConfigBatch = { create(configs:Config[]):Promise<any>, Delete(names:string[]):Promise<any> }

export function ConfigBatch(_dryRun:boolean=false): DAOConfigBatch {

  const dbclient = new DynamoDBClient({ region: process.env.REGION });
  const { getTableName } = DynamoDbConstruct;
  const { CONFIG } = TableBaseNames;
  const TableName = getTableName(CONFIG);


  /**
   * Put multiple items into the table as one operation
   * @param configs 
   * @returns 
   */
  const create = async (configs:Config[]): Promise<BatchWriteItemOutput> => {
    const writeRequests = [] as WriteRequest[];
    configs.forEach((config:Config) => {
      writeRequests.push({
        PutRequest: {
          Item: marshall(config)
        }
      } as WriteRequest)
    });

    const input = {
      RequestItems: {
        [TableName]: writeRequests
      }
    } as BatchWriteItemInput;

    const command = new BatchWriteItemCommand(input);
    return sendCommand(command);
  };

  /**
   * Delete multiple items from the table as one operation
   * @param names 
   * @returns 
   */
  const Delete = async (names:string[]):Promise<BatchWriteItemOutput> => {
    const writeRequests = [] as WriteRequest[];
    names.forEach((name:string) => {
      writeRequests.push({
        DeleteRequest: {
          Key: marshall({ name })
        }
      } as WriteRequest)
    });

    const input = {
      RequestItems: {
        [TableName]: writeRequests
      }
    } as BatchWriteItemInput;

    const command = new BatchWriteItemCommand(input);
    return sendCommand(command);
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

  return { create, Delete }
}