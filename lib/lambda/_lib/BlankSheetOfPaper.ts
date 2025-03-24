import { AdminDeleteUserCommand, AdminDeleteUserCommandOutput, AdminDeleteUserRequest, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { AttributeValue } from "@aws-sdk/client-dynamodb";
import { IContext } from "../../../contexts/IContext";
import { DynamoDbConstruct, TableBaseNames } from "../../DynamoDb";
import { EntityToDemolish } from "../functions/authorized-individual/Demolition";
import { ExhibitFormsBucketEnvironmentVariableName } from "../functions/consenting-person/BucketItemMetadata";
import { lookupUserPoolId } from "./cognito/Lookup";
import { ENTITY_WAITING_ROOM, EntityCrud } from "./dao/dao-entity";
import { ConsenterFields, Entity, InvitationFields, Roles, User, YN } from "./dao/entity";
import { BucketToEmpty, DynamoDbTableToEmpty } from "./Emptier";
import { log, error as logError } from "../Utils";
import { UserCrud } from "./dao/dao-user";
import { cleanupLandscape, CleanupLandscapeParms } from "./timer/cleanup/CleanupRunner";

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
  if( ! UserPoolId) {
    console.error('Cannot find userpool id');
    return;
  }
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
  await deleteConsenters(REGION, UserPoolId, dryRun);

  // 6) Remove all pending invitations (these are entity-less invitations for SYS_ADMIN & RE_ADMIN users who have not accepted them yet)
  await deletePendingInvitations(REGION, dryRun);

  // 7) Empty out the exhibit forms bucket
  const bucketName = process.env[ExhibitFormsBucketEnvironmentVariableName];
  if( ! bucketName) {
    console.error('Cannot empty exhibit forms s3 bucket! - bucket name unknown');
    return;
  }
  await (new BucketToEmpty(bucketName)).empty(dryRun);

  // 8) Remove all orphaned event bridge rules
  await removeOrphanedEventBridgeRules(REGION, dryRun);
}

/**
 * Query for a list of active or non-active consenters and delete each corresponding consenter item.
 * @param active 
 */
export const deleteConsenters = async (region:string, UserPoolId:string, dryRun:boolean):Promise<any> => {
  const { getTableName } = DynamoDbConstruct;
  const { CONSENTERS } = TableBaseNames
  const  TableName = getTableName(CONSENTERS);
  const { email, sub } = ConsenterFields
  const tableToEmpty = new DynamoDbTableToEmpty({
    TableName,
    partitionKey: ConsenterFields.email,
    region,
    dryRun
  });

  const deletions = await tableToEmpty.empty(`${email}, ${sub}`) as Record<string, AttributeValue>[];

  if( ! deletions || deletions.length == 0) {
    console.log(`No consenters to delete`);
    return;
  }

  // Now remove the same consenters from the userpool
  const cognitoClient = new CognitoIdentityProviderClient({ region });
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

/**
 * Delete invitations from the invitations database table that have not been acted upon yet by the invitee.
 */
export const deletePendingInvitations = async (region:string, dryRun:boolean):Promise<any> => {
  const { getTableName } = DynamoDbConstruct;
  const { INVITATIONS } = TableBaseNames
  const  TableName = getTableName(INVITATIONS);
  const { email, code, role } = InvitationFields
  const tableToPrune = new DynamoDbTableToEmpty({
    TableName,
    partitionKey: InvitationFields.code,
    region,
    dryRun
  });

  // Get a list of sysadmins (these will be the only items in the users table left after the purge).
  let sysAdmins = await UserCrud({ userinfo: { entity_id:ENTITY_WAITING_ROOM } as User }).read() as User[];
  sysAdmins = sysAdmins.filter(user => user.role == Roles.SYS_ADMIN);

  /**
   * Purging of database items up to this point was done on an entity-by-entity basis. Therefore any items that
   * remain in the invitations table are those that were not tied to any entity. These will include invitations 
   * for SYS_ADMIN and RE_ADMIN users who have not accepted them yet. Delete these leftover invitations now.
   */
  const deletions = await tableToPrune.prune({
    projectedFieldNames: `${email}, ${code}, ${role}`,
    filterFunction: (item:Record<string, AttributeValue>) => {
      const not_a_sysadmin = item[role]?.S != 'SYS_ADMIN';
      const sysadmin_who_did_not_accept_invitation = sysAdmins.find(sysAdmin => sysAdmin.email == item[email]?.S) == undefined;
      return not_a_sysadmin || sysadmin_who_did_not_accept_invitation;
    }
  }) as Record<string, AttributeValue>[];

  if( ! deletions || deletions.length == 0) {
    console.log(`No pending invitations to delete`);
    return;
  }

  console.log(`${deletions.length} pending invitations deleted`);
}

/**
 * Remove all orphaned event bridge rules.
 * @param region 
 * @param dryrun 
 * @returns 
 */
export const removeOrphanedEventBridgeRules = async (region:string, dryrun:boolean=false):Promise<any> => {
  const prefix = process.env.PREFIX;
  if( ! prefix) {
    console.error('PREFIX environment variable missing!');
    return;
  }
  try {
    const landscape = prefix.split('-')[1];
    const parms = { region, landscape, dryrun } as CleanupLandscapeParms;
    await cleanupLandscape(parms);
  } 
  catch(error) {
    logError(error);
  }
}



// RUN MANUALLY
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/BlankSheetOfPaper.ts')) {

  const task = 'deletePendingInvitations' as 'wipeClean' | 'deleteConsenters' | 'deletePendingInvitations';

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

      const dryRun = false;

      switch(task) {

        case "wipeClean":
          await wipeClean(dryRun);
          console.log('Clean sheet of paper!');
          break;

        case "deleteConsenters":
          const UserPoolId = await lookupUserPoolId(`${prefix}-cognito-userpool`, REGION);
          if( ! UserPoolId) {
            console.error('Cannot find userpool id');
            return;
          }
          process.env.USERPOOL_ID = UserPoolId;        
          await deleteConsenters(REGION, UserPoolId, dryRun);
          break;

        case "deletePendingInvitations":
          await deletePendingInvitations(REGION, dryRun);
          break;
      }
    }
    catch(e) {
      console.error(e);
    }
  })();
}

