import { UserType } from "@aws-sdk/client-cognito-identity-provider";
import { IContext } from "../../../../contexts/IContext";
import { DelayedExecutions } from "../../../DelayedExecution";
import { CognitoStandardAttributes, UserAccount } from "../../_lib/cognito/UserAccount";
import { UserCrud } from "../../_lib/dao/dao-user";
import { DelegateFields, Roles, User, UserFields } from "../../_lib/dao/entity";
import { error, log, lookupCloudfrontDomain } from "../../Utils";

export class EntityRepToCorrect {
  private correctable:User;
  private lookup:boolean;
  private message:string;

  constructor(correctable:User, lookup:boolean=true) {
    this.correctable = correctable;
    this.lookup = lookup;
  }

  public correct = async (corrected:User):Promise<boolean> => {
    try {
      if( ! corrected) {
        console.log(`No user provided`);
        return false;
      }
      if(this.lookup) {
        /**
         * The provided correctable user probably just has the key(s), so go to the database to get the rest.
         * NOTE: Make sure the default timestamp conversion to date objects is avoided - The upcoming update needs 
         * them to be ISO strings.
         */
        const user = await UserCrud({ userinfo: this.correctable }).read({ convertDates:false }) as User;
        if( ! user) {
          error(this.correctable, 'Lookup for user failed');
          return false;
        }
        this.correctable = user;
      }

      const { correctable, correctable: { email:old_email, phone_number:old_phone_number }, mergeUsers } = this;
      const { email:new_email, phone_number:new_phone_number, entity_id, role, delegate } = corrected;

      const fldChanged = (fldname:UserFields):boolean => {
        const old = correctable[fldname];
        const _new = corrected[fldname];
        return (_new && _new != old) as boolean;
      };

      const delegateFldChanged = (fldname:DelegateFields):boolean => {
        const old = correctable.delegate ? correctable.delegate[fldname] : undefined;
        const _new = delegate ? delegate[fldname] : undefined;
        if(old && ! _new) return true;
        if(_new && ! old) return true;
        return (_new && _new != old) as boolean;
      }

      const newEmail = () => fldChanged(UserFields.email);
      const newPhone = () => fldChanged(UserFields.phone_number);
      const delegateChanged = () => {
        return delegateFldChanged(DelegateFields.fullname) || delegateFldChanged(DelegateFields.title)
          || delegateFldChanged(DelegateFields.email) || delegateFldChanged(DelegateFields.phone_number);
      }
      const otherChanges = () => fldChanged(UserFields.fullname) || fldChanged(UserFields.title) || delegateChanged();    
    
      if(newEmail()) {
        const original = { email: { propname:'email', value:old_email } } as CognitoStandardAttributes;
        const updated = { email: { propname:'email', value:new_email } } as CognitoStandardAttributes;
        // Have the new account inherit the old phone number 
        updated.phoneNumber = { propname:'phone_number', value:old_phone_number, verified:true}

        const userAccount = await UserAccount.getInstance(original, role);

        // Create a new user account in cognito and delete the old one.
        const userType:UserType|undefined = await userAccount.replaceWith(updated);

        // Obtain the sub value of the newly created user account.
        const { Username:sub } = userType ?? {}
        if( ! sub) {
          let msg = userAccount.getMessage();
          this.message = msg ? msg : `Error encountered while replacing ${old_email} with ${new_email}: ${msg}`;
          return false;
        }

        // Carry over any fields from the old user that do not exist in the new user.
        corrected = mergeUsers(correctable, corrected);

        // Give the new consenter the sub from the corresponding new cognito user account
        corrected.sub = sub;

        // Ensure a new update_timestamp is applied by blanking out any existing value.
        corrected.update_timestamp = undefined;

        // Delete the old user from the database.
        await UserCrud({ userinfo: correctable }).Delete();

        // Create a new user in the database with the new email address.
        await UserCrud({ userinfo: corrected }).update();
      }
      else if(newPhone()) {
        const original = { email: { propname:'email', value:old_email } } as CognitoStandardAttributes;
        const updated = { email: { propname:'email', value:new_email } } as CognitoStandardAttributes;
        original.phoneNumber = { propname:'phone_number', value:old_phone_number};
        updated.phoneNumber = { propname:'phone_number', value:new_phone_number};

        const userAccount = await UserAccount.getInstance(original, role);

        // Update phone_number in place inside the existing cognito user account. This requires it to be configured as mutable.
        await userAccount.update(updated);
        if( ! userAccount.ok()) {
          this.message = userAccount.getMessage();
          return false;
        }

        // Carry over any fields from the old user that do not exist in the new user.
        corrected = mergeUsers(correctable, corrected);

        // Ensure a new update_timestamp is applied by blanking out any existing value.
        corrected.update_timestamp = undefined;

        // Pass on any updates to the user to the corresponding database record.
        await UserCrud({ userinfo: corrected, removableDelegate:true }).update(correctable, true); 
      }
      else if(otherChanges()) {
        // Carry over any fields from the old user that do not exist in the new user.
        corrected = mergeUsers(correctable, corrected);

        // Ensure a new update_timestamp is applied by blanking out any existing value.
        corrected.update_timestamp = undefined;

        // Pass on any updates to the user to the corresponding database record.
        await UserCrud({ userinfo: corrected, removableDelegate:true }).update(correctable, true);
      }
      else {
        // Huh? If neither the email, phone, fullname or title has changed, then there ARE NO changes.
        this.message = `INVALID STATE: Correction triggered for ${old_email}, but no changes detected.`;
        log(this.message);
        return false;
      }

      return true;
    }
    catch(e:any) {
      log(e);
      this.message = e.message;
      return false;
    }
  }


  /**
   * With the exception of the email field, apply all attributes from the source user to
   * the corresponding attributes of the target user if those target attributes are not already set.
   * @param source 
   * @param target 
   * @returns 
   */
  private mergeUsers = (source:User, target:User):User => {
    let fld: keyof typeof UserFields;
    const { role, email, delegate } = UserFields;
    for(fld in UserFields) {
      if( ! source[fld]) continue;
      switch(fld) {
        case email:
          continue;
        case delegate:
          if( ! target[delegate]) {
            // Absense of a delegate in the target user is an explicit signal to remove the delegate if it exist at the source.
            continue;
          }
        default:
          if( ! target[fld]) {
            if(fld == role) {
              target[role] = source[role] as Roles;
            }
            else {
              target[fld] = source[fld] as any;
            }
          }
          break;
      }
    }

    return target;
  }

  public getMessage = () => {
    return this.message;
  }
}




/**
 * RUN MANUALLY:
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/re-admin/Correction.ts')) {

  const correctionScope = {
    phone: true,
    name: true,
    email: true,
  };

  (async () => {

    // Get context variables
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, ACCOUNT, REGION, TAGS: { Landscape }} = context;
    const prefix = `${STACK_ID}-${Landscape}`;

    // Set the environment variables
    process.env.REGION = REGION;
    process.env.PREFIX = prefix;
    process.env.DEBUG = 'true';

    const email = 'asp2.random.edu@warhen.work';
    const correctable = (await UserCrud({ userinfo: { email } as User }).read({ convertDates:false }) as User[])[0];
    const corrected = Object.assign({}, correctable);
    let { fullname='my full name', entity_id } = correctable;

    if(correctionScope.name) {
      // Append an incrementing counter to the fullname field (makes multiple consecutive corrections easy). 
      const regex = /\x20+\(Corrected\x20+\d+\)$/i;
      const parts = fullname.split(regex);
      let idx = 1;
      if(parts.length > 1) {
        const suffix = regex.exec(fullname)![0];
        idx = parseInt(/\d+/.exec(suffix)![0]) + 1;      
      }
      corrected.fullname = `${parts[0]} (Corrected ${idx})`;   
    }

    if(correctionScope.phone) {
      // Correct the phone number to some randomly generated value that will pass validation checks.
      const randomPhone = `+1617${/\d{7}$/.exec(`${new Date().getTime()}`)![0]}`;
      corrected.phone_number = randomPhone;
    }

    if(correctionScope.email) {
      // Set the cloudfront domain as an environment variable
      const cloudfrontDomain = await lookupCloudfrontDomain(Landscape);
      process.env.CLOUDFRONT_DOMAIN = cloudfrontDomain;

      // Set the ARN for the stale entity vacancy handler
      const { HandleStaleEntityVacancy } = DelayedExecutions;
      const staleFuncName = `${prefix}-${HandleStaleEntityVacancy.coreName}`;
      process.env[HandleStaleEntityVacancy.targetArnEnvVarName] = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${staleFuncName}`
      
      // Set the new email address
      corrected.email = 'asp1.random.edu@warhen.work';
    }

    // Remove the firstname field from the corrections (should make no difference to the output form)
    delete corrected.title;

    // Execute the update
    await new EntityRepToCorrect({ email, entity_id } as User).correct(corrected);

    log('Update complete.');
  })();
}