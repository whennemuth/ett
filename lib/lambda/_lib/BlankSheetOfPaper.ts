import { marshall } from "@aws-sdk/util-dynamodb";
import { EntityToDemolish } from "../functions/authorized-individual/Demolition";
import { lookupUserPoolId } from "./cognito/Lookup";
import { ConsenterCrud } from "./dao/dao-consenter";
import { ENTITY_WAITING_ROOM, EntityCrud } from "./dao/dao-entity";
import { Consenter, Entity, YN } from "./dao/entity";
import { DynamoDBClient, TransactWriteItem, TransactWriteItemsCommand, TransactWriteItemsCommandInput } from "@aws-sdk/client-dynamodb";
import { DynamoDbConstruct, TableBaseNames } from "../../DynamoDb";
import { AdminDeleteUserCommand, AdminDeleteUserCommandOutput, AdminDeleteUserRequest, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";

/**
 * --------------------------------------------------------
 *    Return the system state to a "Blank sheet of paper"
 * --------------------------------------------------------
 * Remove any trace of content related to all entities, except for the ENTITY_WAITING_ROOM.
 * This will leave only two entries left to the database: 
 *   1) The ENTITY_WAITING_ROOM entities table item.
 *   2) The SysAdmin users table item(s).
 * This will leave only one userpool item remaining:
 *   1) The SysAdmin item (or items if more than one SysAdmin)
 * @param dryRun 
 */
const wipeClean = async (dryRun=true) => {

  // 1) Get environment variables
  const { REGION, LANDSCAPE } = process.env;
  if( ! REGION) {
    console.log('REGION environment variable missing!');
    return;
  }
  if( ! LANDSCAPE) {
    console.log('LANDSCAPE environment variable missing!');
    return;
  }

  // 2) Get the userpool ID
  const UserPoolId = await lookupUserPoolId(`ett-${LANDSCAPE}-cognito-userpool`, REGION);
  process.env.USERPOOL_ID = UserPoolId;

  // 3) Get a list of all entities
  const entityDao = EntityCrud({ active: YN.Yes } as Entity);
  const entities = await entityDao.read() as Entity[];

  // 4) Iterate over the entities and "demolish" each
  for(let i=0; i<entities.length; i++) {
    const { entity_id } = entities[i];
    if(entity_id != ENTITY_WAITING_ROOM) {
      const entityToDemolish = new EntityToDemolish(entities[i].entity_id);
      entityToDemolish.dryRun = dryRun
      await entityToDemolish.demolish();
    }
  }

  /**
   * Query for a list of active or non-active consenters and delete each corresponding consenter item.
   * @param active 
   */
  const deleteConsenters = async (active:YN):Promise<any> => {
    const { getTableName } = DynamoDbConstruct;
    const { CONSENTERS } = TableBaseNames
    const  TableName = getTableName(CONSENTERS);
    const TransactItems = [] as TransactWriteItem[];
    const consentersToDelete = [] as Consenter[];

    // Build items into a transaction for deletion.
    let consenterDao = ConsenterCrud({ active } as Consenter);
    let consenters = await consenterDao.read() as Consenter[];
    consenters.forEach(consenter => {
      const { email, sub } = consenter;
      const Key = marshall({ email, sub } as Consenter);
      TransactItems.push({ Delete: { TableName, Key }} as TransactWriteItem);
      consentersToDelete.push(consenter);
    });

    // Execute the transaction to delete the consenters
    if(TransactItems.length > 0) {
      const dynamodbCommandInput = { TransactItems } as TransactWriteItemsCommandInput;
      console.log(`Deleting consenters: ${JSON.stringify(dynamodbCommandInput, null, 2)}`);
      const transCommand = new TransactWriteItemsCommand(dynamodbCommandInput);
      if(dryRun) {
        return new Promise((resolve) => resolve('dryrun'));
      }
      const dbclient = new DynamoDBClient({ region: REGION });
      await dbclient.send(transCommand);

      // Now remove the same consenters from the userpool
      const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });
      for(let i=0; i<consentersToDelete.length; i++) {
        try {
          const { sub:Username, email } = consentersToDelete[i];
          const input = { UserPoolId, Username } as AdminDeleteUserRequest;
          const command = new AdminDeleteUserCommand(input);
          console.log(`Removing consenter from userpool: ${JSON.stringify(input, null, 2)}`);
          if(dryRun) {
            return new Promise((resolve) => resolve('dryrun'));
          }
          const output = await cognitoClient.send(command) as AdminDeleteUserCommandOutput;
          console.log(`User ${email} deleted: ${JSON.stringify(output, null, 2)}`);
        }
        catch(reason) {
          console.log(JSON.stringify(reason, Object.getOwnPropertyNames(reason), 2));
        }
      }
    }
  }

  await deleteConsenters(YN.Yes);
  await deleteConsenters(YN.No);
}

const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_BLANK_SHEET_OF_PAPER') {
  process.env.DEBUG = 'true';

  wipeClean(false)
    .then(() => {
      console.log('Entity deleted');
    })
    .catch((reason) => {
      console.error(reason);
    });
}

