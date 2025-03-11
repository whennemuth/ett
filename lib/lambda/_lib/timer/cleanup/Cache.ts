import { EventBridgeClient, ListRulesCommand, ListRulesCommandInput, ListRulesCommandOutput, Rule } from "@aws-sdk/client-eventbridge";
import { error } from "../../../Utils";
import { EntityCrud } from "../../dao/dao-entity";
import { Consenter, Entity } from "../../dao/entity";
import { ConsenterCrud } from "../../dao/dao-consenter";

export interface IRulesCache {
  getAllRules(landscape:string|undefined):Promise<Rule[]>
  entityDoesNotExist(entityId:string):Promise<boolean>
  consenterDoesNotExist(consenterEmail:string):Promise<boolean>
  deleteRule(ruleName:string):void
  ruleIsDeleted(ruleName:string):boolean
}

/**
 * This class is used to cache rules, entities, and consenters so as to avoid making extraneous repeat SDK calls.
 */
export class RulesCache implements IRulesCache {
  private rulesCache:Map<string, Rule[]> = new Map();
  private deletedRules:string[] = [] as string[];
  private entityIdCache:string[] = [];
  private missingConsenterEmails:string[] = [];
  private foundConsenterEmails:string[] = [];
  private region:string;

  constructor(region:string) {
    this.region = region;
  }

  /**
   * Get all rules for the specified landscape (rule name begins with ett-${landscape}-).
   * First time call for a landscape will trigger a SDK lookup and a cache of the results.
   * Subsequent calls for the same landscape will use the cache.
   * @param region 
   * @returns 
   */
  public getAllRules = async (landscape:string|undefined):Promise<Rule[]> => {
    const { rulesCache, region } = this;
    if( ! landscape) {
      error(`Landscape not set`);
      return [];
    }
    if(rulesCache.has(landscape)) {
      return rulesCache.get(landscape) as Rule[];
    }
    let NamePrefix = 'ett-';
    if(landscape) {
      NamePrefix = NamePrefix + landscape + '-';
    }
    const client = new EventBridgeClient({ region });
    const pageSize = 10;
    const allRules = [] as Rule[];
    let next_token:string|undefined = 'START';
    while(next_token) {
      console.log(`Getting ${next_token == 'START' ? 'first' : 'next'} set of ${pageSize} rules...`);
      const input = { NamePrefix, Limit: Number(pageSize) } as ListRulesCommandInput;
      if(next_token !== 'START') {
        input.NextToken = next_token;
      }
      const command = new ListRulesCommand(input);
      const response = await client.send(command) as ListRulesCommandOutput;
      const { NextToken:token, Rules } = response;
      next_token = token;
      if(Rules) {
        for(const rule of Rules) {
          allRules.push(rule);
        };
      }
    }
    rulesCache.set(landscape, allRules);
    return allRules;
  }

  /**
   * Look through the entity cache for the specified entity id, loading the cache if necessary.
   * @param entityId 
   * @returns 
   */
  public entityDoesNotExist = async (entityId:string):Promise<boolean> => {
    const { entityIdCache } = this;
    if(entityIdCache.length == 0) {
      const entities = await EntityCrud({} as Entity).read() as Entity[];
      entityIdCache.push(...entities.map((entity:Entity):string => entity.entity_id));
    }
    if(entityIdCache.includes(entityId)) {
      return false;
    }
    return true;
  }

  /**
   * Look through the relevant caches for evidence of a consenter existing that matches the provided email. 
   * If the caches indicate that the consenter hasn't been lookuped up yet, then perform the lookup and 
   * update the appropriate cache.
   * @param consenterEmail 
   * @returns
   */
  public consenterDoesNotExist = async (consenterEmail:string):Promise<boolean> => {
    const { missingConsenterEmails, foundConsenterEmails } = this;
    if(missingConsenterEmails.includes(consenterEmail)) {
      return true;
    }
    if(foundConsenterEmails.includes(consenterEmail)) {
      return false;
    }
    const consenter = await ConsenterCrud({ email:consenterEmail } as Consenter).read() as Consenter;
    if(consenter) {
      foundConsenterEmails.push(consenterEmail);
      return false;
    }
    missingConsenterEmails.push(consenterEmail);
    return true;
  }

  public deleteRule = (ruleName:string):void => {
    this.deletedRules.push(ruleName);
  }

  public ruleIsDeleted = (ruleName:string):boolean => {
    return this.deletedRules.includes(ruleName);
  }
}