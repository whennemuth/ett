import { Rule } from "@aws-sdk/client-eventbridge";
import { DisclosureRequestReminderLambdaParms, RulePrefix } from "../../../functions/delayed-execution/SendDisclosureRequestReminder";
import { IRulesCache } from "./Cache";
import { CleanupParms, Filter, SelectionParms } from "./Cleanup";
import { BucketItemMetadata } from "../../../functions/consenting-person/BucketItemMetadata";
import { log } from "../../../Utils";

/**
 * This class is used to filter for disclosure request reminder rules that are "orphaned".
 */
export class FilterForSendDisclosureRequestReminder implements Filter {
  private cleanupParms:CleanupParms;

  constructor(cleanupParms:CleanupParms) {
    this.cleanupParms = cleanupParms;
  }

  public matchForRule = (rule: Rule):boolean => {
    return rule.Description ? rule.Description.startsWith(RulePrefix) : false;
  };

  public getFilter = async (cache:IRulesCache):Promise<SelectionParms> => {
    const { cleanupParms, matchForRule } = this;
    const { entityDoesNotExist, consenterDoesNotExist } = cache;

    log(`Getting selection criteria for: ${RulePrefix}`);

    return {
      region: cleanupParms.region,
      rulefilter: (rule:Rule):boolean => matchForRule(rule),
      targetFilter: async (lambdaInput:any):Promise<boolean> => {
        const { disclosureEmailParms: { s3ObjectKeyForExhibitForm } } = lambdaInput as DisclosureRequestReminderLambdaParms;
        const { fromBucketObjectKey } = BucketItemMetadata;
        const parms = fromBucketObjectKey(s3ObjectKeyForExhibitForm);
        const { entityId, consenterEmail } = parms;
        if(await entityDoesNotExist(entityId)) {
          return true;
        }
        if(entityId == cleanupParms?.entityId) {
          return true;
        }
        if(await consenterDoesNotExist(consenterEmail)) {
          return true;
        }
        if(consenterEmail == cleanupParms?.consenterEmail) {
          return true;
        }
        return false;
      }
    } as SelectionParms;
  }
}