import { Rule } from "@aws-sdk/client-eventbridge";
import { RulePrefix } from "../../../functions/delayed-execution/PurgeExhibitFormFromDatabase";
import { log } from "../../../Utils";
import { IRulesCache } from "./Cache";
import { CleanupParms, Filter, SelectionParms } from "./Cleanup";

/**
 * This class is used to filter for database exhibit form purge rules that are "orphaned".
 */
export class FilterForPurgeExhibitFormFromDatabase implements Filter {
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
        const { consenterEmail, entity_id:entityId } = lambdaInput;
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