import { UserType } from "@aws-sdk/client-cognito-identity-provider";
import { IContext } from "../../../../contexts/IContext";
import { CognitoStandardAttributes, UserAccount } from "../../_lib/cognito/UserAccount";
import { ReadParms } from "../../_lib/dao/dao";
import { ConsenterCrud } from "../../_lib/dao/dao-consenter";
import { Consenter, ConsenterFields, Roles, YN } from "../../_lib/dao/entity";
import { scheduleExhibitFormPurgeFromDatabase } from "./ConsentingPerson";

/**
 * This class performs modifications to a consenting person that affect email and/or phone. In the case 
 * of email, we are dealing with a primary key, so modification goes beyond editing the corresponding records 
 * in place and must replace them instead - this applies to both the database and the userpool. Therefore,
 * these items are removed/deactivated and replaced with new records. Edits to phone (but not email) must
 * include the userpool, but records can be edited in place. Modifications that involve neither email or
 * phone will only affect the corresponding database record as an update, and the userpool will be left alone.
 */
export class ConsentingPersonToCorrect {
  private correctable:Consenter;
  private lookup:boolean;
  private message:string;

  constructor(correctable:Consenter, lookup:boolean=true) {
    this.correctable = correctable;
    this.lookup = lookup;
  }

  public correct = async (correction:Consenter):Promise<boolean> => {
    if(this.lookup) {
      // The provided correctable consenter probably just has the key(s), so go to the database to get the rest.
      // NOTE: Make sure the default timestamp conversion to date objects is avoided - The upcoming update needs them to be ISO strings.
      const consenter = await ConsenterCrud(this.correctable).read({ convertDates:false } as ReadParms) as Consenter|null;
      if( ! consenter) {
        console.error(`Error: Lookup for consenter failed: ${JSON.stringify(this.correctable, null, 2)}`);
        return false;
      }
      this.correctable = consenter;
    }
    
    const { correctable, mergeConsenters } = this;
    const { email, phone_number } = correctable;
    const { email:new_email, phone_number:new_phone_number } = correction;

    const newEmail = () => (new_email && new_email != email);
    const newPhone = () => (new_phone_number && new_phone_number != phone_number);

    // Possible cognito changes first:
    if(newEmail() || newPhone()) {
      /**
       * Update the phone_number attributes of a user in the userpool. This requires that it is
       * configured to be mutable.
       * 
       * and/or..
       * 
       * Create a new user account with the new email and delete the old user account.
       * 
       * NOTE: Modification of the email address attributes is not appropriate here (even if it was mutable)
       * because this will trigger an automatic email to the new email address with a verification code and 
       * the email of the user will be switched to unverified. Since the user is already confirmed, and there 
       * is no way to demote a user as unconfirmed using the SDK, the hosted UI verification prompt will not 
       * appear during a log in attempt, and unconventional workarounds with the preauthentication lambda 
       * trigger, flags, and redirects at the app dashboard screen would be necessary to make it work)
       */
      const original = { email: { propname:'email', value:email } } as CognitoStandardAttributes;
      const updated = { email: { propname:'email', value:new_email } } as CognitoStandardAttributes;
      if(newPhone()) {
        original.phoneNumber = { propname:'phone_number', value:phone_number};
        updated.phoneNumber = { propname:'phone_number', value:new_phone_number};
      }
      else if( ! new_phone_number) {
        // Have the new account inherit the old phone number 
        updated.phoneNumber = { propname:'phone_number', value:phone_number}
      }

      const userAccount = await UserAccount.getInstance(original, Roles.CONSENTING_PERSON);
      if(newEmail()) {
        // Create a new user account in cognito and delete the old one.
        const userType:UserType|undefined = await userAccount.replaceWith(updated);

        // Obtain the sub value of the newly created user account.
        const { Username:sub } = userType ?? {}
        if( ! sub) {
          let msg = userAccount.getMessage();
          this.message = msg ? msg : `Error encountered while replacing ${email} with ${new_email}: ${msg}`;
          return false;
        }

        // Carry over any fields from the old consenter that do not exist in the new consenter.
        correction = mergeConsenters(correctable, correction);

        // Give the new consenter the sub from the corresponding new cognito user account
        correction.sub = sub;

        // Add the new consenter to the database. NOTE: using update to create user to avoid validation checks.
        await ConsenterCrud(correction).update({} as Consenter);

        // Mark the old user as inactive in the database and blank out the sub and exhibit forms
        correctable.active = YN.No;
        correctable.exhibit_forms = [];
        correctable.sub = 'DEFUNCT';
        await ConsenterCrud(correctable).update();

        // Duplicate any exhibit form expiration event bridge rules, but so as to apply against the new consenter db record.
        const { exhibit_forms=[] } = correction;
        if(exhibit_forms.length > 0) {
          for(let i=0; i<exhibit_forms.length; i++) {
            const { create_timestamp:dateStr } = exhibit_forms[i];
            // Use the exhibit form creation date as an offeset so the new egg timer starts into its countdown
            // where the old one left off instead of being "reset" for the full interval. 
            const create_timestamp = dateStr ? new Date(dateStr) : undefined;
            await scheduleExhibitFormPurgeFromDatabase(correction, exhibit_forms[i], create_timestamp);
          }
        }
      }
      else {        
        // Update the existing cognito user account in place.
        await userAccount.update(updated);
        if( ! userAccount.ok()) {
          this.message = userAccount.getMessage();
          return false;
        }

        // Pass on any updates to the consenter to the corresponding database record.
        await ConsenterCrud(correction).update(correctable);
      }
    }
    else {
      // Pass on any updates to the consenter to the corresponding database record.
      await ConsenterCrud(correction).update(correctable);
    }
    
    // TODO: What to do if the user has sent exhibit forms?
    return true;
  }

  /**
   * With the exception of the email field, apply all attributes from the source consenter to
   * the corresponding attributes of the target consenter if those target attributes are not already set.
   * @param source 
   * @param target 
   * @returns 
   */
  private mergeConsenters = (source:Consenter, target:Consenter):Consenter => {
    let fld: keyof typeof ConsenterFields;
    for(fld in ConsenterFields) {
      if( ! source[fld]) continue;
      switch(fld) {
        case ConsenterFields.email:
          continue;
        default:
          if( ! target[fld]) {
            target[fld] = source[fld] as any;
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
if(args.length > 2 && args[2] == 'RUN_MANUALLY_CONSENTER_CORRECTION') {

  (async () => {

    // 1) Get context variables
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, REGION, TAGS: { Landscape }} = context;

    // 2) Set the environment variables
    process.env.REGION = REGION;
    process.env.PREFIX = `${STACK_ID}-${Landscape}`;
    process.env.DEBUG = 'true';

    // 2) Execute the update
    await new ConsentingPersonToCorrect({
      email: 'cp1@warhen.work'
    } as Consenter).correct({
      email: 'cp2@warhen.work',
      phone_number: '+0987654321',
      middlename: 'Bartholomew'
    } as Consenter);

    console.log('Update complete.');
  })();

}
