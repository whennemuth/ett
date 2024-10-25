import { UserType } from "@aws-sdk/client-cognito-identity-provider";
import { IContext } from "../../../../contexts/IContext";
import { CognitoStandardAttributes, UserAccount } from "../../_lib/cognito/UserAccount";
import { ReadParms } from "../../_lib/dao/dao";
import { ConsenterCrud } from "../../_lib/dao/dao-consenter";
import { Consenter, ConsenterFields, Roles, YN } from "../../_lib/dao/entity";
import { CorrectionForm } from "../../_lib/pdf/CorrectionForm";
import { BucketCorrectionForm } from "./BucketItemCorrectionForm";
import { BucketInventory } from "./BucketInventory";
import { scheduleExhibitFormPurgeFromDatabase } from "./ConsentingPerson";
import { ConsenterCorrectionEmail } from "./CorrectionFormEmail";
import { ExhibitFormsBucketEnvironmentVariableName } from "./BucketItemMetadata";

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

  public correct = async (corrected:Consenter):Promise<boolean> => {
    if(this.lookup) {
      /**
       * The provided correctable consenter probably just has the key(s), so go to the database to get the rest.
       * NOTE: Make sure the default timestamp conversion to date objects is avoided - The upcoming update needs 
       * them to be ISO strings.
       */
      const consenter = await ConsenterCrud(this.correctable).read({ convertDates:false } as ReadParms) as Consenter|null;
      if( ! consenter) {
        console.error(`Error: Lookup for consenter failed: ${JSON.stringify(this.correctable, null, 2)}`);
        return false;
      }
      this.correctable = consenter;
    }
    
    const { correctable, mergeConsenters, notifyEntityOfCorrection: sendNotifications } = this;
    const { email, phone_number, exhibit_forms=[] } = correctable;
    const { email:new_email, phone_number:new_phone_number } = corrected;

    const changed = (fldname:ConsenterFields):boolean => {
      const old = correctable[fldname];
      const _new = corrected[fldname];
      return (_new && _new != old) as boolean;
    };
    const { firstname, middlename, lastname, title } = ConsenterFields;
    const newEmail = () => changed(ConsenterFields.email);
    const newPhone = () => changed(ConsenterFields.phone_number);
    const newNameOrTitle = () => changed(firstname) || changed(middlename) || changed(lastname) || changed(title)    

    // Possible cognito changes first:
    if(newEmail() || newPhone()) {
      const original = { email: { propname:'email', value:email } } as CognitoStandardAttributes;
      const updated = { email: { propname:'email', value:new_email } } as CognitoStandardAttributes;
      if(newPhone()) {
        original.phoneNumber = { propname:'phone_number', value:phone_number};
        updated.phoneNumber = { propname:'phone_number', value:new_phone_number};
      }
      else {
        // Have the new account inherit the old phone number 
        updated.phoneNumber = { propname:'phone_number', value:phone_number, verified:true}
      }

      const userAccount = await UserAccount.getInstance(original, Roles.CONSENTING_PERSON);
      if(newEmail()) {
        /**
          * Create a new user account with the new email and delete the old user account.
          * 
          * NOTE: Modification of the email address attributes is not appropriate here (even if it was mutable)
          * because this will trigger an automatic email to the new email address with a verification code and 
          * the email of the user will be switched to unverified. Since the user is already confirmed, and there 
          * is no way to demote a user as unconfirmed using the SDK, the hosted UI verification prompt will not 
          * appear during a log in attempt, and unconventional workarounds with the preauthentication lambda 
          * trigger, flags, and redirects at the app dashboard screen would be necessary to make it work)
         */

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
        corrected = mergeConsenters(correctable, corrected);

        // Give the new consenter the sub from the corresponding new cognito user account
        corrected.sub = sub;

        // Add the new consenter to the database. NOTE: using update to create user to avoid validation checks.
        await ConsenterCrud(corrected).update({} as Consenter);

        // Mark the old user as inactive in the database and blank out the sub and exhibit forms
        correctable.active = YN.No;
        correctable.exhibit_forms = [];
        correctable.sub = 'DEFUNCT';
        await ConsenterCrud(correctable).update();

        // Duplicate any exhibit form expiration event bridge rules, but applied against the new consenter db record.
        if(exhibit_forms.length > 0) {
          for(let i=0; i<exhibit_forms.length; i++) {
            const { create_timestamp:dateStr } = exhibit_forms[i];
            // Use the exhibit form creation date as an offeset so the new egg timer starts into its countdown
            // where the old one left off instead of being "reset" for the full interval. 
            const create_timestamp = dateStr ? new Date(dateStr) : undefined;
            await scheduleExhibitFormPurgeFromDatabase(corrected, exhibit_forms[i], create_timestamp);
          }
        }
      }
      else {   
        // Update phone_number in place inside the existing cognito user account. This requires it to be configured as mutable.
        await userAccount.update(updated);
        if( ! userAccount.ok()) {
          this.message = userAccount.getMessage();
          return false;
        }

        // Carry over any fields from the old consenter that do not exist in the new consenter.
        corrected = mergeConsenters(correctable, corrected);

        // Pass on any updates to the consenter to the corresponding database record.
        await ConsenterCrud(corrected).update(correctable, true);
      }
    }
    else {
      if( ! newNameOrTitle()) {
        // Huh? If neither the email, phone, name or title has changed, then there ARE NO changes.
        console.log(`INVALID STATE: Correction triggered for ${email}, but no changes detected.`);
        return false;
      }

      // Carry over any fields from the old consenter that do not exist in the new consenter.
      corrected = mergeConsenters(correctable, corrected);

      // Pass on any updates to the consenter to the corresponding database record.
      await ConsenterCrud(corrected).update(correctable, true);
    }

    // Create a correction pdf form and email it to the reps of any entities that are indicated.
    const inventory = await BucketInventory.getInstance(email);
    const pdf = await sendNotifications(corrected, inventory);

    // Save the correction form to the bucket if it contains exhibit forms.
    const correctionForm = BucketCorrectionForm.getInstanceForCreation(corrected, correctable);
    await correctionForm.add(pdf);
    
    // NOTE: At this point, if there exist any exhibit forms in the bucket that predate this correction,
    // then the disclosure request email and the reminder emails that use include them will also automatically 
    // append this correction form to those emails. But the associated affiliates need not be informed 
    // just now as were the entity reps.
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
  
  /**
   * Create a correction pdf form and send it to the reps of any entity the consenter still has unfinished
   * disclosure business for. That is, if there are any exhibit forms in the database or the s3 bucket for
   * this consenter, then send a notification to each entity listed in those forms.
   * @param corrected 
   */
  public notifyEntityOfCorrection = async (corrected:Consenter, inventory?:BucketInventory):Promise<CorrectionForm> => {
    const { correctable, correctable:{ email } } = this;
    const { exhibit_forms=[]} = corrected;
    const emailToEntity = new ConsenterCorrectionEmail(correctable, corrected);
    const entitiesNotified = [] as string[];

    // First check the database.
    for(let i=0; i<exhibit_forms.length; i++) {
      const { entity_id } = exhibit_forms[i];
      if(entitiesNotified.includes(entity_id)) {
        const sent = await emailToEntity.sendToEntity(entity_id);
        if(sent) {
          entitiesNotified.push(entity_id);
        }
      }
    }

    // Now check the bucket.
    if( ! inventory) {
      inventory = await BucketInventory.getInstance(email);
    } 
    const entityIds = inventory.getEntityIds();
    for(let i=0; i<entityIds.length; i++) {
      if(entitiesNotified.includes(entityIds[i])) continue;

      const sent = await emailToEntity.sendToEntity(entityIds[i]);

      if(sent) {
        entitiesNotified.push(entityIds[i]);
      }
    }

    return emailToEntity.getCorrectionForm();
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
    const prefix = `${STACK_ID}-${Landscape}`;
    const bucketName = `${prefix}-exhibit-forms`;

    // 2) Set the environment variables
    process.env[ExhibitFormsBucketEnvironmentVariableName] = bucketName;
    process.env.REGION = REGION;
    process.env.PREFIX = `${STACK_ID}-${Landscape}`;
    process.env.DEBUG = 'true';

    const email = 'cp2@warhen.work';
    const correctable = await ConsenterCrud({ email } as Consenter).read() as Consenter;
    const _corrected = Object.assign({}, correctable);

    // Append an incrementing counter to the lastname field (makes multiple consecutive corrections easy). 
    let { lastname='mylastname' } = correctable;
    const regex = /\x20+\(Corrected\x20+\d+\)$/i;
    const parts = lastname.split(regex);
    let idx = 1;
    if(parts.length > 1) {
      const suffix = regex.exec(lastname)![0];
      idx = parseInt(/\d+/.exec(suffix)![0]) + 1;      
    }
    _corrected.lastname = `${parts[0]} (Corrected ${idx})`;   

    // Correct the phone number to some randomly generated value that will pass validation checks.
    const randomPhone = `+1617${/\d{7}$/.exec(`${new Date().getTime()}`)![0]}`;
    _corrected.phone_number = randomPhone;

    // Remove the firstname field from the corrections (should make no difference to the output form)
    delete _corrected.firstname;

    // 2) Execute the update
    await new ConsentingPersonToCorrect({
      email: 'cp2@warhen.work'
    } as Consenter).correct(_corrected);

    console.log('Update complete.');
  })();

}
