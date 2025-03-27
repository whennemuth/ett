import { Rule } from "@aws-sdk/client-eventbridge";
import { Filter, SelectionParms } from "./Cleanup";
import { IRulesCache } from "./Cache";
import { RulePrefix, StaleInvitationLambdaParms } from "../../../functions/delayed-execution/RemoveStaleInvitations";
import { log } from "../../../Utils";


export class FilterForStaleInvitation implements Filter {
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
        const { email, invitationCode, entity_id } = lambdaInput as StaleInvitationLambdaParms;
        if( ! entity_id) {
          false; // If entity_id is not provided, then the entity must be assumed extant and 
          // any corresponding rule cannot be included in the filter for removal.
        }
        return await entityDoesNotExist(entity_id!);        
      }
    } as SelectionParms;
  }
        
}