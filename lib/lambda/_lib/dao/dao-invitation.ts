import { AttributeValue, DeleteItemCommand, DeleteItemCommandInput, DeleteItemCommandOutput, DynamoDBClient, GetItemCommand, GetItemCommandInput, QueryCommand, QueryCommandInput, UpdateItemCommand, UpdateItemCommandInput, UpdateItemCommandOutput } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { DAOInvitation, ReadParms } from './dao';
import { convertFromApiObject } from './db-object-builder';
import { invitationUpdate } from './db-update-builder.invitation';
import { Invitation, InvitationFields } from './entity';
import { DynamoDbConstruct, IndexBaseNames, TableBaseNames } from '../../../DynamoDb';
import { debugLog, log } from '../../Utils';

/**
 * Basic CRUD operations for the invitations table.
 * @param invitationInfo 
 * @returns 
 */
export function InvitationCrud(invitationInfo:Invitation, _dryRun:boolean=false): DAOInvitation {
  const dbclient = new DynamoDBClient({ region: process.env.REGION });
  const { getTableName } = DynamoDbConstruct;
  const { INVITATIONS } = TableBaseNames;
  const { INVITATIONS_ENTITY, INVITATIONS_EMAIL } = IndexBaseNames;
  const TableName = getTableName(INVITATIONS);

  let { code:_code, entity_id, role, email } = invitationInfo;

  let command:any;
  
  /**
   * @returns An instance of UserCrud with the same configuration that is in "dryrun" mode. That is, when any
   * operation, like read, update, query, etc is called, the command is withheld from being issued to dynamodb
   * and is returned instead.
   */
  const dryRun = () => {
    return InvitationCrud(invitationInfo, true);
  }

  const throwMissingError = (task:string, fld:string) => {
    throw new Error(`Invitation ${task} error: Missing ${fld} in ${JSON.stringify(invitationInfo, null, 2)}`)
  }

  /**
   * Create a new invitation
   */
  const create = async (): Promise<UpdateItemCommandOutput> => {
    // Handle missing field validation
    if( ! role) throwMissingError('create', InvitationFields.role);
  
    // If an invitation code is not provided, generate one.
    if( ! _code) {
      _code = uuidv4();
      invitationInfo.code = _code;
    }
    
    console.log(`Creating invitation ${entity_id ? `to ${entity_id} ` : ''}for: ${role}`);
    const input = invitationUpdate(TableName, invitationInfo).buildUpdateItemCommandInput() as UpdateItemCommandInput;
    command = new UpdateItemCommand(input);
    return await sendCommand(command);
  }

  const read = async (readParms?:ReadParms):Promise<(Invitation|null)|Invitation[]> => {
    if(_code) {
      return await _read() as Invitation;
    }
    else if( ! email && ! entity_id ) {
      return await _read(readParms) as Invitation; // Should throw error
    }
    else if(email && entity_id) {
      return await _query({ email, entity_id } as IdxParms, readParms) as Invitation[];
    }
    else if(email) {
      return await _query({ email, entity_id:null } as IdxParms, readParms) as Invitation[];
    }
    else {
      return await _query({ email:null, entity_id } as IdxParms, readParms) as Invitation[];
    }
  }

  const _read = async (readParms?:ReadParms):Promise<Invitation|null> => {
    // Handle field validation
    if( ! _code) {
      throwMissingError('read', InvitationFields.code);
    }

    console.log(`Reading invitation ${_code}`);
    const params = {
      TableName,
      Key: { 
        [InvitationFields.code]: { S: _code },
      }
    } as GetItemCommandInput;
    command = new GetItemCommand(params);
    const retval = await sendCommand(command);
    if( ! retval.Item) {
      return null;
    }
    const { convertDates } = (readParms ?? {});
    return await loadInvitation(retval.Item, convertDates ?? true) as Invitation;
  }

  /**
   * Retrieve potentially more than one record of an invitation. If both email and entity_id are specified
   * then entity_id will be the sort key and only one invitation should be returned, otherwise possibly 
   * multiple items will be returned.
   * @returns 
   */
  type IdxParms = { email:string|null, entity_id:string|null }
  const _query = async (idxParms:IdxParms, readParms?:ReadParms):Promise<Invitation[]> => {
    const { email, entity_id } = idxParms;
    const parmEmail = email ? `email: ${email}` : '';
    let parmEntityId = entity_id ? `entity_id: ${entity_id}` : '';
    if(parmEmail && parmEntityId) parmEntityId = `${parmEntityId}`;

    log({ email, entity_id }, 'Reading all invitations for');

    // Declare QueryCommandInput fields
    let vals = {} as any;
    let cdns = '';
    let index = INVITATIONS_EMAIL;

    // Build QueryCommandInput fields
    if(email) {
      vals[':v1'] = { S: email };
      cdns = `${InvitationFields.email} = :v1`;
    }
    if(entity_id) {
      vals[':v2'] = { S: entity_id };
      if(cdns) {
        cdns = `${cdns} AND ${InvitationFields.entity_id} = :v2`;
      }
      else {
        cdns = `${InvitationFields.entity_id} = :v2`;
      }
      if( ! email) index = INVITATIONS_ENTITY;
    }

    // Declare QueryCommandInput
    const params = {
      TableName,
      IndexName: index,
      ExpressionAttributeValues: vals,
      KeyConditionExpression: cdns
    } as QueryCommandInput;

    // Run the query
    command = new QueryCommand(params);
    const retval = await sendCommand(command);
    const invitations = [] as Invitation[];
    const { convertDates } = (readParms ?? {});
    for(const item in retval.Items) {
      invitations.push(await loadInvitation(retval.Items[item], convertDates ?? true));
    }
    return invitations as Invitation[];
  }

  const update = async ():Promise<UpdateItemCommandOutput> => {
    // Handle field validation
    if( ! _code) {
      throwMissingError('update', InvitationFields.code);
    }
    if( Object.keys(invitationInfo).length == 1 ) {
      throw new Error(`User update error: No fields to update for ${_code}`);
    }
    
    log({ invitation_code:_code, entity_id }, `Updating existing invitation to`);
    const input = invitationUpdate(TableName, invitationInfo).buildUpdateItemCommandInput() as UpdateItemCommandInput;
    command = new UpdateItemCommand(input);
    debugLog(command);
    return await sendCommand(command);
  }

  /**
   * Delete an invitation from the dynamodb table.
   */
  const Delete = async ():Promise<DeleteItemCommandOutput> => {
    if( ! _code) {
      throwMissingError('delete', InvitationFields.code);
    }
    const input = {
      TableName,
      Key: { 
         [InvitationFields.entity_id]: { S: entity_id, },
      },
    } as DeleteItemCommandInput;
    command = new DeleteItemCommand(input);
    return await sendCommand(command);
  }

  /**
   * Delete all invitations that were sent to the specified entity
   * @returns
   */
  const deleteEntity = async ():Promise<DeleteItemCommandOutput> => {

    // Handle missing field validation
    if( ! entity_id) throwMissingError('delete-entity', InvitationFields.entity_id);

    const input = {
      TableName,
      Key: { 
        [InvitationFields.entity_id]: { S: entity_id, },
      } as Record<string, AttributeValue>
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

  const loadInvitation = async (invitation:any, convertDates:boolean):Promise<Invitation> => {
    return new Promise( resolve => {
      resolve(convertFromApiObject(invitation, convertDates) as Invitation);
    })
  }

  const code = () => {
    return _code;
  }

  const test = async () => {
    await read();
  }

  return { create, read, update, Delete, deleteEntity, code, dryRun, test, } as DAOInvitation;
}
