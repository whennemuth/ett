
/**
 * All event bridge rules are deleted by the lambda function they target as a final step of execution.
 * However, the lambda function that the rule has targeted to execute typically checks if the task it is to 
 * carry out needs to be done, and in most cases it does not. Since the scheduied execution time of most of these
 * rules is significantly far in the future, any buildup of rules is not sufficiently offset by the natural 
 * attrition of rules that have been executed and deleted, eventually causing total rule count to exceed the
 * 300 rule limit imposed by event bridge for the events bus. This class acts as a pool of event buses, that are 
 * added and removed as needed so as to increase beyond the 300 rule limit.
*/
export abstract class AbstractPool {
  protected eventBusRuleLimit:number;
  protected busesInventory:Map<string, AbstractEventBus> = new Map();

  constructor(eventBusRuleLimit:number) {
    this.eventBusRuleLimit = eventBusRuleLimit;
  }

  public abstract loadInventory():Promise<void>

  public abstract loadEventBus(index:number):AbstractEventBus

  public abstract createEventBus(index:number):Promise<AbstractEventBus>

  public getLoadedEventBus = (busName:string):AbstractEventBus|undefined => {
    return this.busesInventory.get(busName);
  }
  public getEventBusCount = ():number => {
    return this.busesInventory.size;
  }

  public loadRule = (rule:AbstractEventBusRule, busName:string):void => {
    const { getLoadedEventBus: getEventBus, loadEventBus } = this;
    let bus = getEventBus(busName) ?? loadEventBus(parseInt(busName.split('-')[2]));
    bus.setRule(rule);
  }

  public addRule = async (rule:AbstractEventBusRule):Promise<void> => {
    const { busesInventory, eventBusRuleLimit, createEventBus, removeEventBus } = this;

    const emptyBuses: string[] = [];

    let targetBus:AbstractEventBus|undefined = undefined;

    for(const entry of busesInventory.entries()) {
      const nameOfBus = entry[0];
      const bus = entry[1] as AbstractEventBus;

      // Skip buses that are already at the limit
      if(bus.getRuleCount() >= eventBusRuleLimit) {
        continue;
      }

      // Mark buses for removal that have become empty
      if(bus.getRuleCount() == 0) {
        emptyBuses.push(nameOfBus);
      }

      // If this is the first bus encountered in the loop, set it as the target for now.
      if( ! targetBus) {
        targetBus = bus;
        continue;
      }

      // If the current bus has more rules than the latest target bus, set it as the new target bus
      if(bus.getRuleCount() > targetBus.getRuleCount()) {
        targetBus = bus;
      }
    }

    // If no target bus was found or qualified, create a new one
    if( ! targetBus) {
      let index = 1;
      for(const bus of busesInventory.values()) {
        if(bus.getIndex() == index) {
          index = bus.getIndex() + 1;
        }
      }
      targetBus = await createEventBus(index);
      busesInventory.set(targetBus.getName(), targetBus);
      console.log(`Created new event bus: ${targetBus.getName()}`);
    }

    // Create the rule on the target bus
    await rule.create(targetBus);
    console.log(`Created rule ${rule.getName()} on event bus: ${targetBus.getName()}`);

    // Delete the buses that were found to be empty of rules.
    for(const key of emptyBuses) {
      await removeEventBus(key);
    }
  }

  private removeEventBus = async (busName:string):Promise<void> => {
    const { busesInventory } = this;
    const bus = busesInventory.get(busName) as AbstractEventBus;
    await bus.delete();
    busesInventory.delete(busName);
  }
}

export abstract class AbstractEventBus {
  protected index:number;
  protected busName:string;
  protected rules:Map<string, AbstractEventBusRule> = new Map();

  constructor(index:number) {
    this.index = index;
  }

  public getIndex = ():number => {
    return this.index;
  }
  public setRule = (rule:AbstractEventBusRule):void => {
    this.rules.set(rule.getName(), rule);
  }
  public getRuleCount = (): number => {
    return this.rules.size;
  }

  public abstract create():Promise<AbstractEventBus>

  public abstract delete():Promise<void>

  public abstract getName():string
}

export abstract class AbstractEventBusRule {
  protected parentBus:AbstractEventBus;
  protected ruleName:string;

  public abstract create(eventBus:AbstractEventBus):Promise<AbstractEventBusRule>

  public abstract getName():string

  public setName = (ruleName:string):void => {
    this.ruleName = ruleName;
  }
}