import { Rule } from "@aws-sdk/client-eventbridge";
import { RulePrefix, StaleVacancyLambdaParms } from "../../../functions/delayed-execution/targets/HandleStaleEntityVacancy";
import { log } from "../../../Utils";
import { IRulesCache } from "./Cache";
import { Filter, SelectionParms } from "./Cleanup";

/**
 * This class is used to filter for stale entity vacancy rules that are "orphaned".
 */
export class FilterForStaleEntityVacancy implements Filter {
  private region:string;

  constructor(region:string) {
    this.region = region;
  }

  public matchForRule = (rule: Rule):boolean => {
    return rule.Description ? rule.Description.startsWith(RulePrefix) : false;
  };

  public getFilter = async (cache:IRulesCache):Promise<SelectionParms> => {
    const { region, matchForRule } = this;
    const { entityDoesNotExist } = cache;

    log(`Getting selection criteria for: ${RulePrefix}`);

    return {
      region,
      rulefilter: (rule:Rule):boolean => matchForRule(rule),
      targetFilter: async (lambdaInput:any):Promise<boolean> => {
        const { entity_id } = lambdaInput as StaleVacancyLambdaParms;
        return await entityDoesNotExist(entity_id);
      }
    } as SelectionParms;
  }
}