import { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand, UpdateItemCommand, AttributeValue, UpdateItemCommandInput, DeleteItemCommand, UpdateItemCommandOutput, GetItemCommandInput, QueryCommandInput } from '@aws-sdk/client-dynamodb'
import { Invitation, InvitationFields } from './entity';
import { Builder, getUpdateCommandBuilderInstance } from './db-update-builder'; 
import { convertFromApiObject } from './db-object-builder';
import { DAOInvitation } from './dao';
import { v4 as uuidv4 } from 'uuid';

const dbclient = new DynamoDBClient({ region: process.env.REGION });

/**
 * Basic CRUD operations for the invitations table.
 * @param invitationInfo 
 * @returns 
 */
export function InvitationCrud(invitationInfo:Invitation): DAOInvitation {

  let { code:_code, entity_id, role, email } = invitationInfo;

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
    const builder:Builder = getUpdateCommandBuilderInstance(invitationInfo, 'invitation', process.env.DYNAMODB_INVITATION_TABLE_NAME || '');
    const input:UpdateItemCommandInput = builder.buildUpdateItem();
    const command = new UpdateItemCommand(input);
    return await sendCommand(command);
  }

  const read = async ():Promise<(Invitation|null)|Invitation[]> => {
    if(_code) {
      return await _read() as Invitation;
    }
    else if( ! email && ! entity_id ) {
      return await _read() as Invitation; // Should throw error
    }
    else if(email && entity_id) {
      return await _query({ email, entity_id } as IdxParms) as Invitation[];
    }
    else if(email) {
      return await _query({ email, entity_id:null } as IdxParms) as Invitation[];
    }
    else {
      return await _query({ email:null, entity_id } as IdxParms) as Invitation[];
    }
  }

  const _read = async ():Promise<Invitation|null> => {
    // Handle field validation
    if( ! _code) {
      throwMissingError('read', InvitationFields.code);
    }

    console.log(`Reading ${_code}`);
    const params = {
      TableName: process.env.DYNAMODB_INVITATION_TABLE_NAME,
      Key: { 
        [InvitationFields.code]: { S: _code },
      }
    } as GetItemCommandInput;
    const command = new GetItemCommand(params);
    const retval = await sendCommand(command);
    if( ! retval.Item) {
      return null;
    }
    return await loadInvitation(retval.Item) as Invitation;
  }

  /**
   * Retrieve potentially more than one record of an invitation. If both email and entity_id are specified
   * then entity_id will be the sort key and only one invitation should be returned, otherwise possibly 
   * multiple items will be returned.
   * @returns 
   */
  type IdxParms = { email:string|null, entity_id:string|null }
  const _query = async (idxParms:IdxParms):Promise<Invitation[]> => {
    const { email, entity_id } = idxParms;
    console.log(`Reading all invitations for ${email}`);

    // Declare QueryCommandInput fields
    let vals = {} as any;
    let cdns = '';
    let index = 'EmailIndex';

    // Build QueryCommandInput fields
    if(email) {
      vals[':v1'] = { S: email };
      cdns = `${InvitationFields.email} = :v1`;
    }
    if(entity_id) {
      vals[':v2'] = { S: entity_id };
      if(cdns) cdns = `${cdns} AND ${InvitationFields.entity_id} = :v2`;
      if( ! email) index = 'EntityIndex';
    }

    // Declare QueryCommandInput
    const params = {
      TableName: process.env.DYNAMODB_INVITATION_TABLE_NAME,
      IndexName: index,
      ExpressionAttributeValues: vals,
      KeyConditionExpression: cdns
    } as QueryCommandInput;

    // Run the query
    const command = new QueryCommand(params);
    const retval = await sendCommand(command);
    const invitations = [] as Invitation[];
    for(const item in retval.Items) {
      invitations.push(await loadInvitation(retval.Items[item]));
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
    
    console.log(`Updating existing invitation in: ${_code}/${entity_id}`);
    const builder:Builder = getUpdateCommandBuilderInstance(invitationInfo, 'invitation', process.env.DYNAMODB_INVITATION_TABLE_NAME || '');
    const input:UpdateItemCommandInput = builder.buildUpdateItem();
    const command = new UpdateItemCommand(input);
    return await sendCommand(command);
  }

  const Delete = async () => {
    // TODO: write this function
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

  const loadInvitation = async (invitation:any):Promise<Invitation> => {
    return new Promise( resolve => {
      resolve(convertFromApiObject(invitation) as Invitation);
    })
  }

  const code = () => {
    return _code;
  }

  const test = async () => {
    await read();
  }

  return { create, read, update, Delete, code, test, } as DAOInvitation;
}
