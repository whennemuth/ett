import { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand, UpdateItemCommand, AttributeValue, UpdateItemCommandInput, DeleteItemCommand } from '@aws-sdk/client-dynamodb'
import { Validator, Entity, EntityFields } from './entity';
import { Builder, getUpdateCommandBuilderInstance } from './db-update-builder'; 
import { DAOEntity } from './dao';


export function EntityCrud(entityInfo:Entity): DAOEntity {
  return {} as DAOEntity;
}