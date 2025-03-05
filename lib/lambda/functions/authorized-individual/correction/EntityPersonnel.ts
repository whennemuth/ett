import { IContext } from "../../../../../contexts/IContext";
import { DelayedExecutions } from "../../../../DelayedExecution";
import { lookupUserPoolId } from "../../../_lib/cognito/Lookup";
import { CognitoStandardAttributes, UserAccount } from "../../../_lib/cognito/UserAccount";
import { EntityCrud } from "../../../_lib/dao/dao-entity";
import { InvitationCrud } from "../../../_lib/dao/dao-invitation";
import { UserCrud } from "../../../_lib/dao/dao-user";
import { Entity, Invitation, Role, User, YN } from "../../../_lib/dao/entity";
import { SignupLink } from "../../../_lib/invitation/SignupLink";
import { log, lookupCloudfrontDomain } from "../../../Utils";
import { inviteUser } from "../../re-admin/ReAdminUser";
import { EntityCorrectionEmail } from "./EntityCorrectionEmail";

export type PersonnelParms = {
  entity?:Entity|string, replacer?:User|string, registrationUri?:string
}

/**
 * This class represents an entity with respect to its "personnel" - the ASP and the 2 authorized individuals.
 * The context in which this class is useful is in entity correction, where one AI wants to replace another AI
 * or the ASP with someone else, and either "swaps" that person in immediately, or vacates the "seat" taken by
 * the individual to be replaced and enters a grace period through which they can postpone filling the seat.
 */
export class Personnel {
  private users:User[] = [];
  private _dryrun:boolean=false;

  private entity_id:string;
  private replacerEmail?:string;
  private replaceableEmail?:string;
  private replacementEmail?:string;

  private entity:Entity;
  private replacer?:User;
  private replaceable?:User;
  private registrationUri?:string;

  constructor(parms:PersonnelParms) {
    const { entity, replacer, registrationUri } = parms;
    this.registrationUri = registrationUri;
    if(entity) {
      if(typeof entity === 'string') {
        this.entity_id = entity;
      }
      else {
        this.entity = entity;
        this.entity_id = entity.entity_id;
      }
    }
    if(typeof replacer === 'string') {
      this.replacerEmail = replacer;
    }
    else {
      this.replacer = replacer;
      this.replacerEmail = (replacer ?? {}).email;
    }
  }
  
  /**
   * Fetch the entity and every user in the entity from the database. Subsequent calls will reference the
   * cached results as indicated.
   * @returns 
   */
  public initialize = async ():Promise<Personnel> => {
    let { entity, entity_id, replaceable, replaceableEmail, replacer, replacerEmail, users } = this;

    // Load the entity from the database
    if(entity) {
      this.entity_id = entity.entity_id;
    }
    else if(entity_id) {
      this.entity = await EntityCrud({ entity_id } as Entity).read() as Entity;
      if( ! this.entity) throw new Error(`Cannot find entity in database: ${entity_id}`);
    }
    else if(replacer){
      this.entity_id = replacer.entity_id;
    }
    else if(replacerEmail) {
      const lookupResult = await UserCrud({ email:replacerEmail } as User).read() as User[];
      if(lookupResult.length > 1) {
        throw new Error(`${replacerEmail} is a member of more than one registered entity: ${
          JSON.stringify(lookupResult.map(user => user.entity_id), null, 2)
        }`);
      } 
      if(lookupResult.length == 1) {
        this.replacer = lookupResult[0];
        this.entity_id = this.replacer.entity_id;
        if(this.replacerEmail == this.replaceableEmail) {
          this.replaceable = this.replacer;
        }
        return this.initialize();
      }
      throw new Error(`No such user in database: ${replacerEmail}`);
    }

    // Load the current users in the entity from the database
    if(users.length == 0) {
      const _users = await UserCrud({ entity_id } as User).read() as User[];
      if(_users.length == 0) {
        throw new Error(`The following entity has no users: ${entity_id}`);
      }
      this.users = _users;
      users = _users;
    }

    // Find the user that is doing any replacing from the prior lookup results, if specified.
    if( ! replacer && replacerEmail) {
      const _replacer = users.find(u => u.email == replacerEmail);
      if( ! _replacer) {
        log(`No such user in database: ${replacerEmail} for ${entity_id}`);
      }
      this.replacer = _replacer;
    }

    if( ! this.replacer) {
      log(`EntityPersonnel: This instance is not sufficiently configured for personnel swaps since the replacer is not specified`);
    }

    // Find the user to replace from the prior lookup results
    if(replaceable) {
      this.replaceableEmail = replaceable.email;
    }
    else {
      const _replaceable = users.find(u => u.email == replaceableEmail);
      if(_replaceable) {
        this.replaceable = _replaceable;
      }
    }

    return this;
  }

  /**
   * Configure the instance and perform initial lookups through function chaining.
   * @param replaceable 
   * @param replacement 
   */
  public dryrun = ():Personnel => {
    this._dryrun = true;
    return this;
  }
  public forRemovalOf = (replaceable?:string|User):Personnel => {
    if( ! replaceable) return this;
    typeof replaceable === 'string' ? this.replaceableEmail = replaceable : this.replaceable = replaceable;
    return this;
  }
  public myself = ():Personnel => {
    this.replaceable = this.replacer;
    this.replaceableEmail = this.replacerEmail;
    return this;
  }
  public andReplacementWith = (replacementEmail:string):Personnel => {
    this.replacementEmail = replacementEmail;
    return this;
  }

  /**
   * This is the last function to be called in the function chaining. It performs the swap.
   */
  public execute = async ():Promise<Personnel> => {
    const { initialize, users } = this;
    await initialize();
    const { entity_id, replacer, replacerEmail, replaceable, replaceableEmail, replacementEmail, _dryrun:dryrun } = this;
    const equalIgnoreCase = (s1?:string, s2?:string) => `${s1}`.toLowerCase() == `${s2}`.toLowerCase();
    
    // Intercept obvious mistakes first
    if( ! replacer) {
      throw new Error(`Cannot execute - correcting individual unknown`);
    }
    if(equalIgnoreCase(replacerEmail, replacementEmail)) {
      throw new Error(`${replacementEmail} cannot replace themselves with themself`);
    }
    if(equalIgnoreCase(replaceableEmail, replacementEmail)) {
      throw new Error(`${replacementEmail} cannot be replaced with the themself`)
    }
    if( ! replaceable) {
      throw new Error(`No such user in database: ${replaceableEmail} for ${entity_id}`);
    }

    const deactivateUserInDatabase = async ():Promise<void> => {
      log(replaceable, 'Personnel.deactivateUserInDatabase')
      if(dryrun) {
        log(replaceable, `DRYRUN: deactivating user in database...`);
        return;
      }
      const { email, entity_id } = replaceable;
      await UserCrud({ email, entity_id, active:YN.No } as User).update();

      // Remove any invitations the user may have been issued
      await InvitationCrud({ email, entity_id} as Invitation).Delete();
    }

    const removeUserFromCognito = async ():Promise<void> => {
      log(replaceable, 'Personnel.removeUserFromCognito')
      if(dryrun) {
        log(`DRYRUN: Removing ${replaceable.email} from cognito...`);
        return;
      }
      const account = await UserAccount.getInstance({
        email: { propname:'email', value:replaceable.email }
      } as CognitoStandardAttributes, replaceable.role);

      const deleted = await account.Delete();

      // Bail out if there was an issue deleting the user from cognito
      if( ! deleted) {
        throw new Error(account.getMessage());
      }
    };

    const inviteNewUser = async () => {
      const { registrationUri } = this;
      const invitee = { email:replacementEmail, entity_id, role:replaceable.role } as User;
      const inviterRole = replacer.role;
      if( ! inviterRole) {
        throw new Error(`Cannot invite ${replacementEmail} - unable to determine role of inviter`);
      }
      const linkGenerator = async (entity_id:string, role?:Role) => {
        return await new SignupLink().getRegistrationLink({ email:invitee.email, entity_id, registrationUri });
      };
      if(dryrun) {
        const link = await linkGenerator(entity_id);
        log({ invitee, link }, `DRYRUN: Sending invitation`);
        return;
      }
      log(invitee, 'Personnel.inviteNewUser');
      await inviteUser(invitee, inviterRole, linkGenerator );
    }

    // Deactivate the user being swapped out in the database
    await deactivateUserInDatabase();

    // Remove the user being swapped out from cognito
    await removeUserFromCognito();

    // Notify the user they have been removed from the entity.
    await new EntityCorrectionEmail(replaceable, replacer).send();

    // Notify any other active user in the entity of the amendment
    const others:User[] = users.filter(u => u.email != replaceableEmail && u.email != replacerEmail);
    for(const user of others) {
      await new EntityCorrectionEmail(replaceable, replacer).send(user.email);
    }

    // Invite the new user if specified.
    if(replacementEmail) {
      await inviteNewUser();
    }

    return this;
  }

  public getReplacerEmail = ():string|undefined =>  this.replacerEmail;

  public getReplaceableUser = ():User|undefined => this.replaceable;

  public getEntity = ():Entity => this.entity;

  public getUsers = ():User[] => this.users;
}




/**
 * RUN MANUALLY: 
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/authorized-individual/correction/EntityPersonnel.ts')) {

  const swapType = 'replace-another' as 'replace-self'|'remove-self'|'replace-another'|'remove-another';
  const dryrun = false;
  const { HandleStaleEntityVacancy } = DelayedExecutions;

  (async () => {
    const context:IContext = await require('../../../../../contexts/context.json');
    const { STACK_ID, ACCOUNT, REGION, TAGS: { Landscape }} = context;
    const prefix = `${STACK_ID}-${Landscape}`;

    // Get cloudfront domain
    const cloudfrontDomain = await lookupCloudfrontDomain(Landscape);

    // Get userpool ID
    const userpoolId = await lookupUserPoolId(`${prefix}-cognito-userpool`, REGION);

    // Get the arn of the applicable delayed execution lambda function
    const staleFuncName = `${prefix}-${HandleStaleEntityVacancy.coreName}`;

    // Set environment variables
    process.env[HandleStaleEntityVacancy.targetArnEnvVarName] = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${staleFuncName}`;
    process.env.CLOUDFRONT_DOMAIN = cloudfrontDomain;
    process.env.USERPOOL_ID = userpoolId;
    process.env.REGION = REGION;
    process.env.PREFIX = prefix;

    // Set parameters
    const replacer = 'auth2.random.edu@warhen.work';
    const replaceable = 'auth1.random.edu@warhen.work';
    const replacement = 'auth3.random.edu@warhen.work';

    // Perform the personnel operation
    let swap:Personnel;
    const registrationUri = `https://${cloudfrontDomain}/bootstrap/index.htm`;
    const parms = { replacer, registrationUri } as PersonnelParms
    switch(swapType) {
      case "replace-self":
        swap = new Personnel(parms).forRemovalOf().myself().andReplacementWith(replacement);
        break;
      case "remove-self":
        swap = new Personnel(parms).forRemovalOf().myself();
        break;
      case "replace-another":
        swap = new Personnel(parms).forRemovalOf(replaceable).andReplacementWith(replacement);
        break;
      case "remove-another":
        swap = new Personnel(parms).forRemovalOf(replaceable);
        break;
    }

    if(dryrun) {
      swap = swap.dryrun();
    }
    
    await swap!.execute();
  })();
}
