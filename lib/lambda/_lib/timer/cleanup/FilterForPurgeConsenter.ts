import { Rule } from "@aws-sdk/client-eventbridge";
import { CleanupParms, Filter, SelectionParms } from "./Cleanup";
import { RulePrefix } from "../../../functions/delayed-execution/PurgeConsenter";
import { IRulesCache } from "./Cache";
import { log } from "../../../Utils";

export class FilterForPurgeConsenter implements Filter {
  private cleanupParms:CleanupParms;

  constructor(cleanupParms:CleanupParms) {
    this.cleanupParms = cleanupParms;
  }

  public matchForRule = (rule: Rule):boolean => {
    return rule.Description ? rule.Description.startsWith(RulePrefix) : false;
  };

  public getFilter = async (cache:IRulesCache):Promise<SelectionParms> => {
    const { cleanupParms, matchForRule } = this;
    const { consenterDoesNotExist } = cache; 
     
    log(`Getting selection criteria for: ${RulePrefix}`);
    
    return {
      region: cleanupParms.region,
      rulefilter: (rule:Rule):boolean => matchForRule(rule),
      targetFilter: async (lambdaInput:any):Promise<boolean> => {
        const { consenterEmail } = lambdaInput;
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