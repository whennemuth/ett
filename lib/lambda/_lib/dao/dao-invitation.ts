import { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand, UpdateItemCommand, AttributeValue, UpdateItemCommandInput, DeleteItemCommand } from '@aws-sdk/client-dynamodb'
import { Invitation, InvitationAttempt, InvitationAttemptFields, InvitationFields } from './entity';
import { Builder, getUpdateCommandBuilderInstance } from './db-update-builder'; 
import { convertFromApiObject } from './db-object-builder';
import { DAOInvitation } from './dao';

const dbclient = new DynamoDBClient({ region: process.env.REGION });

export type UpdateOutput = {
  append: any[],
  update: any []
}

/**
 * Basic CRUD operations for the invitations table.
 * @param invitationInfo 
 * @returns 
 */
export function InvitationCrud(invitationInfo:Invitation): DAOInvitation {

  const { email, entity_name, attempts } = invitationInfo;

  const throwMissingError = (task:string, fld:string) => {
    throw new Error(`Invitation ${task} error: Missing ${fld} in ${JSON.stringify(invitationInfo, null, 2)}`)
  }

  /**
   * Create/append a new invitation
   */
  const create = async (): Promise<any> => {
    const { role, link, sent_timestamp } = attempts[0] as InvitationAttempt;
    if( ! role) throwMissingError('create', InvitationAttemptFields.role);
    if( ! link) throwMissingError('create', InvitationAttemptFields.link)

    console.log(`Creating invitation to ${entity_name || 'unspecified'} for: ${email} as ${role}`);
    const builder:Builder = getUpdateCommandBuilderInstance(invitationInfo, process.env.DYNAMODB_INVITATION_TABLE_NAME || '', 'create');
    const input:UpdateItemCommandInput = builder.buildUpdateItem();
    const command = new UpdateItemCommand(input);
    return await sendCommand(command);
  }

  const read = async ():Promise<Invitation|Invitation[]> => {
    if(entity_name) {
      return await _read() as Invitation;
    }
    else {
      return await _query() as Invitation[];
    }
  }

  /**
   * Get a single item for a set of invitations for a specific user to a specific entity.
   * @returns 
   */
  const _read = async ():Promise<Invitation> => {
    console.log(`Reading ${email} / ${entity_name}`);
    const params = {
      TableName: process.env.DYNAMODB_USER_TABLE_NAME,
      Key: { 
        [InvitationFields.email]: { S: email, },
        [InvitationFields.entity_name]: { S: entity_name }
      }
    };
    const command = new GetItemCommand(params);
    const retval = await sendCommand(command);
    return await loadInvitation(retval.Item) as Invitation;
  }

  /**
   * Retrieve potentially more than one item a single email comprising all invitation sets for any entity.
   * That is, without specifying the sort key (entity_name), you could get multiple entries for the user across different entities.
   * @returns 
   */
  const _query = async ():Promise<Invitation[]> => {
    console.log(`Reading ${email}`);
    const params = {
      TableName: process.env.DYNAMODB_INVITATION_TABLE_NAME,
      ExpressionAttributeValues: {
        ':v1': { S: email }
      },
      KeyConditionExpression: `${InvitationFields.email} = :v1`
    };
    const command = new QueryCommand(params);
    const retval = await sendCommand(command);
    const invitations = [] as Invitation[];
    for(const item in retval.Items) {
      invitations.push(await loadInvitation(retval.Items[item]));
    }
    return invitations as Invitation[];
  }

  const update = async ():Promise<UpdateOutput> => {
    if( ! entity_name) {
      throwMissingError('update', InvitationFields.entity_name);
    }
    else if( ! attempts || attempts.length == 0 ) {
      throw new Error(`Invitation update error: No fields to update for ${entity_name}: ${email}`);
    }

    const existing:Invitation = await _read();
    
    const sameAttempt = (a1:InvitationAttempt, a2:InvitationAttempt):boolean => {
      const isoString = (o:any):string => {
        if(typeof o === 'string') return o;
        if(o instanceof Date) return o.toISOString();
        return o;
      }
      if(a1.role != a2.role) return false;
      if(isoString(a1.sent_timestamp) != isoString(a2.sent_timestamp)) return false;
      return true;
    }

    const updateAttempt = async (index:number):Promise<any> => {
      console.log(`Updating existing invitation in: ${email}/${entity_name}`);
      const builder:Builder = getUpdateCommandBuilderInstance(invitationInfo, process.env.DYNAMODB_INVITATION_TABLE_NAME || '', 'update');
      const input:UpdateItemCommandInput = builder.buildUpdateItem(index);
      const command = new UpdateItemCommand(input);
      return await sendCommand(command);
    }

    const appendAttempt = async ():Promise<any> => {
      console.log(`Appending new invitation to: ${email}/${entity_name}`);
      const builder:Builder = getUpdateCommandBuilderInstance(invitationInfo, process.env.DYNAMODB_INVITATION_TABLE_NAME || '', 'update');
      const input:UpdateItemCommandInput = builder.buildUpdateItem();
      const command = new UpdateItemCommand(input);
      return await sendCommand(command);
    }

    const output = {
      append: [] as any[],
      update: [] as any[]
    } as UpdateOutput;

    OuterLoop: for(const newAttempt of attempts) {
      let counter:number = 0;
      for(const existingAttempt of existing.attempts) {
        if(sameAttempt(newAttempt, existingAttempt)) {
          const retval = await updateAttempt(counter);
          output.update.push(retval);
          continue OuterLoop;
        }
        counter++;
      }
      const retval = await appendAttempt();
      output.append.push(retval);
    }

    return output;
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

  const test = async () => {
    await read();
  }

  const loadInvitation = async (invitation:any):Promise<Invitation> => {
    return new Promise( resolve => {
      resolve(convertFromApiObject(invitation) as Invitation);
    })
  }

  return { create, read, update, Delete, test, } as DAOInvitation;
}