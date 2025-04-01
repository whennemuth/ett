import { DeleteRuleCommand, DeleteRuleRequest, EventBridgeClient, ListRulesCommand, ListRulesCommandInput, ListRulesCommandOutput, ListTargetsByRuleCommand, ListTargetsByRuleCommandInput, RemoveTargetsCommand, RemoveTargetsCommandInput, RemoveTargetsResponse, Rule, Target } from "@aws-sdk/client-eventbridge";
import { log } from "../../../Utils";


/**
 * Use the SDK to lookup the target for the specified rule. Assumes that the rule has only one target.
 * @param Rule 
 * @param region 
 * @returns 
 */
export const lookupTarget = async (Rule:string, region:string):Promise<Target|void> => {
  log(`Looking up target for rule: ${Rule}`);
  const client = new EventBridgeClient({ region });
  const commandInput = { Rule } as ListTargetsByRuleCommandInput;
  const command = new ListTargetsByRuleCommand(commandInput);
  const response = await client.send(command);
  const { Targets=[] } = response;
  if(Targets.length > 0) {
    return Targets[0]; // Assume only one target
  }
}


/**
 * Lookup all rules with the specified name prefix for a specified event bus.
 * @param NamePrefix 
 * @param region 
 * @param EventBusName 
 * @returns 
 */
export const lookupRules = async (NamePrefix:string, region:string, EventBusName:string='default'): Promise<Rule[]> => {
  const client = new EventBridgeClient({ region });
  const pageSize = 10;
  const allRules = [] as Rule[];
  let next_token:string|undefined = 'START';

  log(`Listing rules for event bus: ${EventBusName}...`);
  while(next_token) {
    console.log(`Getting ${next_token == 'START' ? 'first' : 'next'} set of ${pageSize} rules...`);
    const input = { NamePrefix, Limit: Number(pageSize) } as ListRulesCommandInput;
    if(EventBusName !== 'default') {
      input.EventBusName = EventBusName;
    }
    if(next_token !== 'START') {
      input.NextToken = next_token;
    }
    const command = new ListRulesCommand(input);
    const response = await client.send(command) as ListRulesCommandOutput;
    const { NextToken:token, Rules } = response;
    next_token = token;
    if(Rules) {
      allRules.push(...Rules);
    }
  }
  return allRules;
}


/**
 * Delete a single rule along with its target identifier (not the target itself).
 * @param eventBridgeRuleName 
 * @param targetId 
 * @returns 
 */
export const deleteRuleAndTarget = async (eventBridgeRuleName:string, targetId:string, region:string):Promise<void> => {
  const client = new EventBridgeClient({ region });

  if( ! targetId ) {
    log({ eventBridgeRuleName, targetId }, `ERROR: Cannot delete rule, missing targetId`);
    return;
  }

  if( ! eventBridgeRuleName) {
    log({ eventBridgeRuleName, targetId }, 'Cannot delete rule, missing eventBridgeRuleName');
    return;
  }

  // 1) Remove the lambda target from the rule
  const removeRequest = {
    Rule: eventBridgeRuleName,
    Ids: [ targetId ],        
  } as RemoveTargetsCommandInput;
  log(removeRequest, 'Removing lambda target from event bridge rule');
  try {
    const removeResponse:RemoveTargetsResponse = await client.send(new RemoveTargetsCommand(removeRequest));
    if((removeResponse.FailedEntries ?? []).length > 0) {
      log(removeResponse, `ERROR: Failed to remove lambda target from event bridge rule`)
    }
  }
  catch(e) {
    log(e, `Failed to remove lambda target from event bridge rule`);
  }

  // 2) Delete the rule
  const deleteRequest = {
    Name:eventBridgeRuleName,
    Force:true
  } as DeleteRuleRequest;
  log(deleteRequest, `Deleting event bridge rule`);
  try {
    await client.send(new DeleteRuleCommand(deleteRequest));
  }
  catch(e) {
    if((e as Error).name == 'ResourceNotFoundException') {
      log(e, `Event bridge rule ${eventBridgeRuleName} not found`);
    }
    else {
      log(e, `Failed to delete event bridge rule`);
    }
  }
}
