import { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand, UpdateItemCommand, AttributeValue, UpdateItemCommandInput, DeleteItemCommand } from '@aws-sdk/client-dynamodb'
import { User, UserFields, YN, Validator, Entity, Invitation } from './entity';
import { Builder, getBuilderInstance } from './builder'; 

const dbclient = new DynamoDBClient({ region: process.env.REGION });
const validator = Validator();

export type DAO = { 
  create():Promise<any>; 
  read():Promise<User|User[]>; 
  update():Promise<any>; 
  Delete():Promise<any>; 
  test():Promise<any> 
};

export type FactoryParms = {
  DAOType: 'user' | 'entity' | 'invitation',
  Payload: any
}

export class DAOFactory {
  constructor() { }
  
  public static getInstance(parms:FactoryParms): DAO {

    switch(parms.DAOType) {
      case 'user':
        const { role='', active='' } = parms.Payload as User;
        
        if( role && ! validator.isRole(role)) {
          throw new Error(`Invalid role specified: ${role}`);
        }
        if( active && ! validator.isYesNo(active)) {
          throw new Error(`Invalid Y/N active field value specified: ${active}`);
        }

        return UserCrud(parms.Payload as User);
      case 'entity':
        
        return EntityCrud(parms.Payload as Entity);
      case 'invitation':

        return InvitationCrud(parms.Payload as Invitation);
    }
  }
}

/**
 * Basic CRUD operations for the dynamodb table behind the user base.
 * @param {*} userinfo 
 * @returns 
 */
export function UserCrud(userinfo:User): DAO {

  const { email, entity_name, role='', sub='', fullname='', active=YN.Yes } = userinfo;

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
    if(userinfo.entity_name) {
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
  const update = async () => {
    if( ! email ) {
      throw new Error(`User update error: email is missing.`);
    }
    else if( ! entity_name ) {
      throw new Error(`User update error: entity name missing for ${email}`);
    }
    else if( Object.keys(userinfo).length == 2 ) {
      throw new Error(`User update error: No fields to update for ${entity_name}: ${email}`);
    }
    console.log(`Updating ${email} / ${entity_name}`);
    const builder:Builder = getBuilderInstance(userinfo, process.env.DYNAMODB_USER_TABLE_NAME || '');
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
    if( ! email ) {
      throw new Error(`User delete error: email is missing.`);
    }
    else if( ! entity_name ) {
      throw new Error(`User update error: entity name missing for ${email}`);
    }
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
      resolve({
        [UserFields.email]: user[UserFields.email].S,
        [UserFields.entity_name]: user[UserFields.entity_name].S,
        [UserFields.role]: user[UserFields.role].S,
        [UserFields.sub]: user[UserFields.sub].S,
        [UserFields.fullname]: user[UserFields.fullname].S,
        [UserFields.active]: user[UserFields.active].S,
        [UserFields.create_timestamp]: user[UserFields.create_timestamp].S,
        [UserFields.update_timestamp]: user[UserFields.update_timestamp].S
      } as User);
    });
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

  const test = async () => {
    await read();
  }
  
  return {
    create, read, update, Delete, test,
  }
}

export function EntityCrud(entityInfo:Entity): DAO {
  return {} as DAO;
}

export function InvitationCrud(entityInfo:Invitation): DAO {
  return {} as DAO;
}
