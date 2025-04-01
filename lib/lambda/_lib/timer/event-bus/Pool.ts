import { EventBridgeClient, EventBus, ListEventBusesCommand, ListEventBusesCommandInput, ListEventBusesCommandOutput, ListRulesCommand, ListRulesCommandInput, ListRulesCommandOutput, Rule } from "@aws-sdk/client-eventbridge";
import { AbstractEventBus, AbstractPool } from "./Abstract";
import { log } from "../../../Utils";
import { EttEventBus } from "./Bus";
import { IContext } from "../../../../../contexts/IContext";
import { getTestLambdaFunction, SetupParms } from "./TestTarget";
import { EttRule, EttRuleData } from "./Rule";
import { EggTimer, PeriodType } from "../EggTimer";

export type PoolParms = { eventBusRuleLimit: number, appName:string, landscape:string, region:string };

export const ACCOUNT_BUS_LIMIT = 100;

export class EttPool extends AbstractPool {
  private parms:PoolParms;
  private NamePrefix:string;

  constructor(parms:PoolParms) {
    super(parms.eventBusRuleLimit);
    this.parms = parms;
    this.NamePrefix = `${parms.appName}-${parms.landscape}-`;
  }

  /**
   * Load all of the event buses, including their rules, into the inventory.
   */
  public loadInventory = async(): Promise<void> => {
    const { parms: { appName='ett', landscape, region }, loadEventBus, busesInventory, NamePrefix } = this;
    const { getIndexFromName} = AbstractEventBus;
    const client = new EventBridgeClient({ region });
    const pageSize = 10;
    const allBuses = [] as EventBus[];
    let next_token:string|undefined = 'START';

    log(`Listing event buses for ${appName}-${landscape}...`);
    while(next_token) {
      console.log(`Getting ${next_token == 'START' ? 'first' : 'next'} set of ${pageSize} event buses...`);
      const input = { NamePrefix, Limit: Number(pageSize) } as ListEventBusesCommandInput;
      if(next_token !== 'START') {
        input.NextToken = next_token;
      }
      const command = new ListEventBusesCommand(input);
      const response = await client.send(command) as ListEventBusesCommandOutput;
      const { NextToken:token, EventBuses } = response;
      next_token = token;
      if(EventBuses) {
        for(const bus of EventBuses) {
          allBuses.push(bus);
        };
      }      
    }

    log(`Loading rules of ${busesInventory.size} listed event buses...`);
    for(const bus of allBuses) {
      const busName = bus.Name as string;
      const index = getIndexFromName(busName);
      const eventBus = await loadEventBus(index);
      busesInventory.set(busName, eventBus);
    }

    await loadEventBus(0); // Load the default event bus (zero indicates the default bus)
  }

  /**
   * Load all the rules for the event bus specified by the index.
   * @param index 
   */
  public loadEventBus = async (index: number): Promise<AbstractEventBus> =>{
    const { parms: { appName='ett', landscape, region }, busesInventory, NamePrefix } = this;
    const client = new EventBridgeClient({ region });
    const pageSize = 10;
    const allRules = [] as Rule[];
    const busName = index == 0 ? 'default' : `${appName}-${landscape}-${index}`;
    let next_token:string|undefined = 'START';

    log(`Listing rules for event bus: ${busName}...`);
    while(next_token) {
      console.log(`Getting ${next_token == 'START' ? 'first' : 'next'} set of ${pageSize} rules...`);
      const input = { NamePrefix, Limit: Number(pageSize) } as ListRulesCommandInput;
      if(busName !== 'default') {
        input.EventBusName = busName;
      }
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

    const bus = new EttEventBus(NamePrefix, index);
    busesInventory.set(bus.getName(), bus);
    return bus;
  }

  /**
   * Create a new event bus with the specified index.
   * @param index 
   */
  public createEventBus = async (index: number): Promise<AbstractEventBus> => {
    const { NamePrefix } = this;
    const bus = new EttEventBus(NamePrefix, index);
    await bus.create();
    return bus;
  }
}



/**
 * RUN MANUALLY: Create a bunch of rules into the pool to test:
 *   1) The event bus rule limit
 *   2) Event bus creation
 *   3) Rule placement.
 *   4) Event bus deletion
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/timer/event-bus/Pool.ts')) {
  (async () => {
    const context:IContext = await require('../../../../../contexts/context.json');
    const { REGION:region, STACK_ID:app, TAGS: { Landscape:landscape }} = context;
    const basename = `${app}-${landscape}-TEST`;
    const lambdaFunctionName = `${basename}_FUNCTION`;
    const eventRuleName = `${basename}_RULE`;

    // With 7 and 3 as a combo, 3 event buses will be created, the 1st and 2nd with 3 rules, and the last with 1 rule.
    // const ruleCount = 7; // How many rules to create
    const ruleCount = 1; // How many rules to create
    const eventBusRuleLimit = 3; // How many rules can be on a bus at once
    
    let testLambda; 

    try {

      // Create a test lambda function (that deletes rules and targets that call it)
      testLambda = getTestLambdaFunction({ lambdaFunctionName, region } as SetupParms);
      const lambdaArn = await testLambda.create();

      // Create a bunch of rules that target the lambda function
      const pool = new EttPool({ eventBusRuleLimit, appName: 'ett', landscape, region } as PoolParms);
      for(let i=1; i<=ruleCount; i++) {
        const lambdaInput = { message: `This is test input ${i}!` };
        const Description = `This is a test rule ${i}`;
        const ScheduleExpression = EggTimer.getInstanceSetFor(1, PeriodType.MINUTES).getCronExpression();
        await pool.addRule(new EttRule({ lambdaArn, lambdaInput, Description, ScheduleExpression, Name:`${eventRuleName}-${i}` } as EttRuleData));
      }

      /**
       * Wait for the all the rules to trigger and get self-deleted, then run again for just one rule and observe 
       * that the pool deletes all of the empty buses except for the one that is indexed with a "1"
       */
      await new Promise(resolve => setTimeout(resolve, 120000));
    }
    catch(e: any) {
      console.error(e);
    }
    finally { 
      if(testLambda) {
        await testLambda.destroy();
      }
    }    
  })();
}