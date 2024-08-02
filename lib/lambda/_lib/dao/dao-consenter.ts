import { DeleteItemCommand, DeleteItemCommandInput, DeleteItemCommandOutput, DynamoDBClient, GetItemCommand, GetItemCommandInput, GetItemCommandOutput, PutItemCommandOutput, TransactWriteItem, TransactWriteItemsCommand, TransactWriteItemsCommandInput, UpdateItemCommand, UpdateItemCommandInput, UpdateItemCommandOutput } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDbConstruct, TableBaseNames } from "../../../DynamoDb";
import { DAOConsenter, ReadParms } from "./dao";
import { convertFromApiObject } from "./db-object-builder";
import { consenterUpdate } from "./db-update-builder.consenter";
import { AffiliateTypes, Consenter, ConsenterFields, Roles, YN } from "./entity";

export function ConsenterCrud(consenterInfo:Consenter, _dryRun:boolean=false): DAOConsenter {

  const dbclient = new DynamoDBClient({ region: process.env.REGION });
  const docClient = DynamoDBDocumentClient.from(dbclient);
  const { getTableName } = DynamoDbConstruct;
  const { CONSENTERS } = TableBaseNames;
  const TableName = getTableName(CONSENTERS);
  
  let { email, active=YN.Yes, firstname, middlename, lastname, exhibit_forms, 
    create_timestamp=(new Date().toISOString()), consented_timestamp, renewed_timestamp, rescinded_timestamp
  } = consenterInfo;

  let command:any;

  /**
  * @returns An instance of ConsenterCrud with the same configuration that is in "dryrun" mode. That is, when any
  * operation, like read, update, query, etc is called, the command is withheld from being issued to dynamodb
  * and is returned instead.
  */
  const dryRun = () => {
    return ConsenterCrud(consenterInfo, true);
  }

  const throwMissingError = (task:string, fld:string) => {
    throw new Error(`Consenter ${task} error: Missing ${fld} in ${JSON.stringify(consenterInfo, null, 2)}`);
  }

  const throwIllegalParm = (task:string, fld:string) => {
    const consenter = JSON.stringify(consenterInfo, null, 2) as string;
    throw new Error(`Consenter ${task} error: A consenter cannot be created with ${fld} - ${consenter}`);
  }

  /**
   * Create a new consenter.
   * @returns 
   */
  const create = async (): Promise<PutItemCommandOutput> => {
    console.log(`Creating ${Roles.CONSENTING_PERSON}: ${firstname} ${middlename} ${lastname}`);

    // Handle required field validation
    if( ! email) throwMissingError('create', ConsenterFields.email);

    // Handle illegal (premature) field validation
    if(consented_timestamp) throwIllegalParm('create', ConsenterFields.consented_timestamp);
    if(rescinded_timestamp) throwIllegalParm('create', ConsenterFields.rescinded_timestamp);
    if(renewed_timestamp) throwIllegalParm('create', ConsenterFields.renewed_timestamp);
    if(exhibit_forms && exhibit_forms.length > 0) throwIllegalParm('create', ConsenterFields.exhibit_forms);
    if( ! exhibit_forms) {
      // Always initialize a consenter item with an empty exhibit forms list. This will avoid an error when
      // attempting to append to that list for the first time - it must exist, albeit empty.
      consenterInfo.exhibit_forms = [];
    }

    // Make sure the original userinfo object gets a create_timestamp value if a default value is invoked.
    if( ! consenterInfo.create_timestamp) consenterInfo.create_timestamp = create_timestamp;
    consenterInfo.active = active;

    return await sendCommand(new PutCommand({
      TableName,
      Item: consenterInfo
    }));
  }

  const read = async (readParms?:ReadParms):Promise<(Consenter|null)|Consenter[]> => {
    // Handle missing field validation
    if( ! email) throwMissingError('read', ConsenterFields.email);

    console.log(`Reading email ${email}`);
    const params = {
      TableName,
      Key: {
        [ConsenterFields.email]: { S: email }
      }
    } as GetItemCommandInput
    command = new GetItemCommand(params);
    const retval:GetItemCommandOutput = await sendCommand(command);
    if( ! retval.Item) {
      return null;
    }

    const { convertDates } = (readParms ?? {});

    return await loadConsenter(retval.Item, convertDates ?? true);
  }

  /**
   * Update a specific consenter record associated with the specified primary key (email)
   */
  const update = async (oldConsenterInfo:Consenter):Promise<UpdateItemCommandOutput|void> => {
    // Handle field validation
    if( ! email) {
      throwMissingError('update', ConsenterFields.email);
    }
    if( Object.keys(consenterInfo).length == 1 ) {
      throw new Error(`Consenter update error: No fields to update for ${email}`);
    }
    const consenterMissing = ():boolean => !oldConsenterInfo || oldConsenterInfo == {} as Consenter;

    if(consenterMissing()) {
      oldConsenterInfo = await read() as Consenter;
      if(consenterMissing()) {
        throw new Error(`Consenter update error: No such consenter ${email}`);
      }
    }
    console.log(`Updating consenter: ${email}`);
    const input = consenterUpdate(TableName, consenterInfo, oldConsenterInfo).buildUpdateItemCommandInput() as UpdateItemCommandInput|UpdateItemCommandInput[];
    let command:UpdateItemCommand;
    if(input instanceof Array) {
      return await transUpdate(input);
    }
    else {
      command = new UpdateItemCommand(input);
      return await sendCommand(command);
    }    
  }

  /**
   * Perform multiple updates in an all or nothing transaction.
   * @param inputs 
   * @returns 
   */
  const transUpdate = async (inputs:UpdateItemCommandInput[]) => {
    if(inputs.length == 0) {
      console.log(`Consenter update cancelled: No changes detected in: ${JSON.stringify(consenterInfo, null, 2)}`);
      return;
    }
    const TransactItems = [] as TransactWriteItem[];
    const loadTransactItem = (_input:UpdateItemCommandInput) => {
      const { Key, TableName, ConditionExpression, ExpressionAttributeNames, ExpressionAttributeValues, UpdateExpression } = _input;
      TransactItems.push({
        Update: {
          Key, TableName, ConditionExpression, ExpressionAttributeNames, ExpressionAttributeValues, UpdateExpression
        }
      });
    };
    inputs.forEach(input => loadTransactItem(input));
    const commandInput = { TransactItems } as TransactWriteItemsCommandInput;
    const transCommand = new TransactWriteItemsCommand(commandInput);
    return await sendCommand(transCommand);
  }

  /**
   * Delete a consenter from the dynamodb table.
   * This is probably not a function you want to expose too publicly, favoring a deactivate method in client
   * code that calls the update function to toggle the active field to "N".
   */
  const Delete = async ():Promise<DeleteItemCommandOutput> => {
    const input = {
      TableName,
      Key: { 
         [ConsenterFields.email]: { S: email, },
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
        response = await docClient.send(command);
      }           
    }
    catch(e) {
      console.error(e);
    }          
    return response;
  }

  const loadConsenter = async (consenter:any, convertDates:boolean):Promise<Consenter> => {
    return new Promise( resolve => {
      resolve(convertFromApiObject(consenter, convertDates) as Consenter);
    });
  }

  const test = async () => {
    await read();
  }

  return { create, read, update, Delete, dryRun, test } as  DAOConsenter;
}


/**
 * RUN MANUALLY: 
 */
const { argv:args } = process;
enum TASK { create='create', update='update', read='read', Delete='delete' };
if(args.length > 2 && args[2] == 'RUN_MANUALLY_DAO_CONSENTER') {
  process.env.REGION = 'us-east-2';
  const task = args.length > 3 ? args[3] : TASK.create;
  const email = 'daffy@warnerbros.com';
  switch(task as TASK) {
    case TASK.create:
      var dao = ConsenterCrud({
        email,
        firstname: 'Daffy',
        middlename: 'D',
        lastname: 'Duck',
        title: 'Aquatic fowl',
        phone_number: '617-333-5555',        
      } as Consenter);
      dao.create()
        .then((retval:any) => {
          console.log(`Create successful: ${JSON.stringify(retval, null, 2)}`);
        })
        .catch((e:any) => {
          JSON.stringify(e, Object.getOwnPropertyNames(e), 2);
        });
      break;
    case TASK.update:
      enum UPDATE_TYPE { consent='consent', sub='sub', exhibit='exhibit' };
      const updateType = args.length > 4 ? args[4] : 'consent';
      let consenter = { } as Consenter;
      switch(updateType as UPDATE_TYPE) {
        case UPDATE_TYPE.sub:
          consenter = { email, sub: 'cognito-user-sub' };
          break;
        case UPDATE_TYPE.consent:
          consenter = { email, consented_timestamp: new Date().toISOString() };
          break;
        case UPDATE_TYPE.exhibit:
          consenter = {
            email,
            exhibit_forms: [{
              entity_id: 'def-456',
              affiliates: [
                {
                  affiliateType: AffiliateTypes.EMPLOYER,
                  email: 'formerEmployer@formerOrg.com',
                  fullname: 'George J Jetson',
                  org: 'Former Organization',
                  phone_number: '617-777-0000',
                  title: 'Manager'
                },
                // {
                //   affiliateType: AffiliateTypes.ACADEMIC,
                //   email: 'formerColleague@formerUniversity.edu',
                //   fullname: 'Roger Rabbit',
                //   org: 'Former University',
                //   phone_number: '781-222-4444',
                //   title: 'Researcher'
                // }
              ]
            },
            {
              entity_id: 'ijk-789',
              affiliates: [
                {
                  affiliateType: AffiliateTypes.ACADEMIC,
                  email: 'formerColleague@formerUniversity.edu',
                  fullname: 'Roger Rabbit',
                  org: 'Former University',
                  phone_number: '781-222-4444',
                  title: 'Researcher'
                }
              ]
            }
          ]
          };
      }
      var dao = ConsenterCrud(consenter);
      dao.update()
        .then((retval:any) => {
          console.log(`Create successful: ${JSON.stringify(retval, null, 2)}`);
        })
        .catch((e:any) => {
          JSON.stringify(e, Object.getOwnPropertyNames(e), 2);
        });
      break;
    case TASK.read:
      console.log('Not implemented');
      break;
    case TASK.Delete:
      console.log('Not implemented');
      break;
  }
}