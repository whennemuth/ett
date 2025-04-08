import { v4 as uuidv4 } from 'uuid';
import { IContext } from "../../../contexts/IContext";
import { EntityToDemolish } from "../functions/authorized-individual/Demolition";
import { ExhibitFormsBucketEnvironmentVariableName } from "../functions/consenting-person/BucketItemMetadata";
import { log } from "../Utils";
import { lookupUserPoolId } from "./cognito/Lookup";
import { CognitoStandardAttributes, UserAccount } from "./cognito/UserAccount";
import { EntityCrud } from "./dao/dao-entity";
import { InvitationCrud } from "./dao/dao-invitation";
import { UserCrud } from "./dao/dao-user";
import { Entity, Invitation, Roles, User } from "./dao/entity";

/**
 * This class can be used as a time saver in creating and staffing an entity.
 * Useful for testing without having to go through emails and invitations.
 */
export class EntityToAutomate {
  private entityName:string;
  private entity:Entity;
  private asps = [] as User[];
  private ais = [] as User[];
  private createInvitations:boolean;

  constructor(entityName:string, createInvitations:boolean=false) {
    this.entityName = entityName;
  }

  public addAsp = (user:User):EntityToAutomate => {
    if( ! user.email) throw new Error(`Invalid parameter: user missing email`);
    if(this.asps.find(u => u.email.toLowerCase() == user.email.toLowerCase())) {
      return this;
    }
    user.role = Roles.RE_ADMIN;
    this.asps.push(user);
    return this;
  }

  public addAI = (user:User):EntityToAutomate => {
    if( ! user.email) throw new Error(`Invalid parameter: user missing email`);
    if(this.ais.find(u => u.email.toLowerCase() == user.email.toLowerCase())) {
      return this;
    }
    user.role = Roles.RE_AUTH_IND;
    this.ais.push(user);
    return this;
  }

  private getEntity = async ():Promise<Entity|void> => {
    const { entityName, entity } = this;
    if(entity) return entity;

    // Query for the entity by name
    log(`Looking up entity "${entityName}" in the database...`);
    const entities = await EntityCrud({ entity_name_lower: entityName.toLowerCase()} as Entity).read() as Entity[];
    if(entities.length > 1) {
      throw new Error(`More than one entity result for name: ${entityName}`);
    }

    // If the entity already exists in the database, bail out now.
    if(entities.length == 1) {
      this.entity = entities[0];
      return this.entity;
    }
  }

  private createEntity = async () => {
    const { entityName, getEntity } = this;
    
    // Bail out if the entity already exists.
    const entity = await getEntity();
    if(entity) return;

    // No entity found in the database by specified name, so create it.
    log(`Creating entity \"${entityName}\"...`);
    const registered_timestamp = new Date().toISOString();
    const entityCrud = EntityCrud({ entity_name:entityName, description:entityName, registered_timestamp } as Entity);
    await entityCrud.create();

    // Read in the created entity.
    this.entity = await entityCrud.read() as Entity;
  }


  private sampledUsers = [] as User[];

  private createUser = async (user:User) => {
    const { entity: { entity_id }, entityName, sampledUsers, createInvitations } = this;
    const { email, role } = user;

    // This should be enough sample users
    const sampleUsers = [
      { fullname:'Bugs Bunny', phone_number:'+6173334444', title:'Rabbit' },
      { fullname:'Daffy Duck', phone_number:'+7814448888', title:'Sufferin Succotash!' },
      { fullname:'Elvis Presley', phone_number:'+5083339999', title:'Entertainer' },
      { fullname:'Sherlock Holmes', phone_number:'+6172334567', title:'Detective' },
      { fullname:'Fred Flintstone', phone_number:'+7812227777', title:'Quarry Manager' },
      { fullname:'Elmer Fudd', phone_number:'+5084567890', title:'Wabbit Hunter' },
      { fullname:'Yosemite Sam', phone_number:'+6179235867', title:'Cowboy' },
      { fullname:'Foghorn Leghorn', phone_number:'+7814902597', title:'Rooster'}
    ] as User[];
    
    // Fill in the "blanks" of the supplied user
    if( !user.fullname || !user.phone_number || !user.title) {
      // Get the first sample user that is not in sampledUsers
      const sampleUser = sampleUsers.find(u => sampledUsers.findIndex(su => su.fullname == u.fullname) == -1);
      if( ! sampleUser) {
        throw new Error(`Out of users - you have used up more than 8`);
      }
      const { fullname, phone_number, title } = sampleUser;
      if( ! user.fullname)  user.fullname = fullname;
      if( ! user.phone_number) user.phone_number = phone_number;
      if( ! user.title) user.title = title;
      sampledUsers.push(sampleUser);
    }

    const { phone_number } = user;

    // Create the cognito account first
    log(`Creating Cognito userpool account for ${email}...`)
    const attributes = { 
      email: { propname:'email', value:email, verified:true },
      phoneNumber: { propname:'phone_number', value:phone_number }
    } as CognitoStandardAttributes;
    const account = await UserAccount.getInstance(attributes, role);
    const userType = await account.createWithPassword('passWORD123!@#');

    // Create the database entry next
    log(`Creating database entry for ${email} for entity \"${entityName}\"...`)
    const { Username:sub } = userType ?? {};
    if( ! sub) {
      throw new Error(`Error encountered while creating cognito account for ${email}`);
    }
    user.sub = sub;
    user.entity_id = entity_id;
    await UserCrud({ userinfo:user }).create();

    if( ! createInvitations) return;

    // Create invitations as if they had been sent, accepted, and used to mark registration date.    
    const now = new Date().toISOString();
    await InvitationCrud({
      code: uuidv4(),
      email, entity_id, entity_name:entityName, role, 
      sent_timestamp:now, registered_timestamp:now, 
      fullname:user.fullname, title:user.title, message_id:uuidv4()
    } as Invitation).update();
  }

  /**
   * Set up the entity (create it and staff it)
   * @returns 
   */
  public setup = async ():Promise<EntityToAutomate> => {
    const { createEntity, createUser, asps, ais } = this;

    // Create the entity
    await createEntity();

    // Create the ASP(s)
    for(let i=0; i<asps.length; i++) {
      await createUser(asps[i]);
    }

    // Create the AI(s)
    for(let i=0; i<ais.length; i++) {
      await createUser(ais[i]);
    }

    return this;
  }

  /**
   * Tear down the entity (remove it, its reps, and any related exhibit form content from s3)
   * @returns 
   */
  public teardown = async () => {
    const { getEntity, entityName } = this;

    // Lookup the entity
    const entity = await getEntity();
    if( ! entity) {
      log(`Entity \"${entityName}\" not found - nothing to tear down.`);
      return;
    }
    const { entity_id } = entity;

    // Tear down the entity and its users (database and userpool)
    const demolishable = new EntityToDemolish(entity_id);
    await demolishable.demolish();
  }
}



/**
 * RUN MANUALLY:
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/EntityAutomation.ts')) {

  const task = 'setup' as 'setup' | 'teardown' | 'recycle'
  const entityName = 'The School of Hard Knocks';

  // Setup an entity with one ASP and two AIs
  (async () => {
    try {

      // 1) Get context variables
      const context:IContext = await require('../../../contexts/context.json');
      const { STACK_ID, REGION, TAGS: { Landscape }} = context;
      const userpoolId = await lookupUserPoolId(`${STACK_ID}-${Landscape}-cognito-userpool`, REGION);

      // 2) Set the environment variables
      process.env.REGION = REGION;
      process.env.PREFIX = `${STACK_ID}-${Landscape}`;
      process.env.DEBUG = 'true';
      process.env.USERPOOL_ID = userpoolId;
      process.env[ExhibitFormsBucketEnvironmentVariableName] = `${STACK_ID}-${Landscape}-exhibit-forms`;
      
      const setup = async () => {
        await new EntityToAutomate(entityName)
        .addAsp({ email:'asp1.random.edu@warhen.work' } as User)
        .addAI({ email:'auth1.random.edu@warhen.work' } as User)
        .addAI({ email:'auth2.random.edu@warhen.work' } as User)
        .setup();
      }

      const teardown = async () => {
        await new EntityToAutomate(entityName).teardown();
      }

      // 3) Execute the task
      switch(task) {
        case "setup":
          await setup();
          break;
        case "teardown":
          await teardown();
          break;
        case "recycle":
          await teardown();
          await setup();
          break;
      }
    }
    catch(e) {
      log(e);
    }
  })();
}
