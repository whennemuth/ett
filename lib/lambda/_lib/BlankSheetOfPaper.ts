import { AdminDeleteUserCommand, AdminDeleteUserCommandOutput, AdminDeleteUserRequest, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { AttributeValue } from "@aws-sdk/client-dynamodb";
import { IContext } from "../../../contexts/IContext";
import { DynamoDbConstruct, TableBaseNames } from "../../DynamoDb";
import { EntityToDemolish } from "../functions/authorized-individual/Demolition";
import { ExhibitFormsBucketEnvironmentVariableName } from "../functions/consenting-person/BucketItemMetadata";
import { lookupUserPoolId } from "./cognito/Lookup";
import { ENTITY_WAITING_ROOM, EntityCrud } from "./dao/dao-entity";
import { ConsenterFields, Entity, YN } from "./dao/entity";
import { BucketToEmpty, DynamoDbTableToEmpty } from "./Emptier";
import { log } from "../Utils";

/**
 * --------------------------------------------------------
 *    Return the system state to a "Blank sheet of paper"
 * --------------------------------------------------------
 * Remove any trace of content related to all entities, except for the ENTITY_WAITING_ROOM.
 * This will leave only three kinds of entries left to the database: 
 *   1) The ENTITY_WAITING_ROOM entities table item.
 *   2) The SysAdmin users table item(s).
 *   3) The Configuration table items.
 * This will leave only one userpool item remaining:
 *   1) The SysAdmin item (or items if more than one SysAdmin)
 * @param dryRun 
 */
export const wipeClean = async (dryRun=true) => {

  /**
   * Query for a list of active or non-active consenters and delete each corresponding consenter item.
   * @param active 
   */
  const deleteConsenters = async (dryRun:boolean):Promise<any> => {
    const { getTableName } = DynamoDbConstruct;
    const { CONSENTERS } = TableBaseNames
    const  TableName = getTableName(CONSENTERS);
    const tableToEmpty = new DynamoDbTableToEmpty({
      TableName,
      partitionKey: ConsenterFields.email,
      region: REGION,
      dryRun
    });

    const deletions = await tableToEmpty.empty('email, sub') as Record<string, AttributeValue>[];

    if( ! deletions || deletions.length == 0) {
      console.log(`No consenters to delete`);
      return;
    }

    // Now remove the same consenters from the userpool
    const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });
    for(let i=0; i<deletions.length; i++) {
      try {
        const { sub: { S:Username }, email: { S:email }} = deletions[i];
        const input = { UserPoolId, Username } as AdminDeleteUserRequest;
        const command = new AdminDeleteUserCommand(input);
        log(input, `${dryRun ? 'DRYRUN: ' : '' }Removing consenter from userpool`);
        if(dryRun) {
          return new Promise((resolve) => resolve('dryrun'));
        }
        const output = await cognitoClient.send(command) as AdminDeleteUserCommandOutput;
        log(output, `User ${email} deleted`);
      }
      catch(reason) {
        log(reason);
      }
    }
  }

  
  // 1) Get environment variables
  const { PREFIX, REGION } = process.env;
  if( ! PREFIX) {
    console.log('PREFIX environment variable missing!');
    return;
  }
  if( ! REGION) {
    console.log('REGION environment variable missing!');
    return;
  }

  // 2) Get the userpool ID
  const UserPoolId = await lookupUserPoolId(`${PREFIX}-cognito-userpool`, REGION);
  process.env.USERPOOL_ID = UserPoolId;

  // 3) Get a list of all entities
  const entityDao = EntityCrud({ active: YN.Yes } as Entity);
  const entities = await entityDao.read() as Entity[];

  // 4) Iterate over the entities and "demolish" each
  let deletedEntities:number = 0
  for(let i=0; i<entities.length; i++) {
    const { entity_id } = entities[i];
    if(entity_id != ENTITY_WAITING_ROOM) {
      const entityToDemolish = new EntityToDemolish(entities[i].entity_id);
      entityToDemolish.dryRun = dryRun
      await entityToDemolish.demolish();
      deletedEntities += 1;
    }
  }
  console.log(`${deletedEntities} entities deleted`);

  // 5) Remove all consenters from dynamodb and cognito
  await deleteConsenters(dryRun);

  // 6) Empty out the exhibit forms bucket
  const bucketName = process.env[ExhibitFormsBucketEnvironmentVariableName];
  if( ! bucketName) {
    console.error('Cannot empty exhibit forms s3 bucket! - bucket name unknown');
    return;
  }
  await (new BucketToEmpty(bucketName)).empty(dryRun);
}

const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_BLANK_SHEET_OF_PAPER') {

  (async () => {
    try {
      process.env.DEBUG = 'true';
      const context:IContext = await require('../../../contexts/context.json');
      const { STACK_ID, REGION, TAGS: { Landscape } } = context;
      const prefix = `${STACK_ID}-${Landscape}`;
      const bucketName = `${prefix}-exhibit-forms`;
      process.env[ExhibitFormsBucketEnvironmentVariableName] = bucketName;
      process.env.PREFIX = prefix;
      process.env.REGION = REGION;

      const dryRun = false
      await wipeClean(dryRun);

      console.log('Clean sheet of paper!');
    }
    catch(e) {
      console.error(e);
    }
  })();
}

