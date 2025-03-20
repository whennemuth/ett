import { AbstractEventBus, AbstractEventBusRule, AbstractPool } from "./Abstract";
import { v4 as uuidv4 } from 'uuid';

function EventBridgeMock(defaultRules:string[] = []) {
  const rules = [...defaultRules] as string[];
  const addRule = (rulename:string, busname:string) => {
    rules.push(`${busname}__${rulename}`);
  }
  const removeRule = (ruleName:string) => {
    const index = rules.indexOf(ruleName);
    if(index > -1) {
      rules.splice(index, 1);
    }
  }
  const listRules = ():string[] => {
    return rules;
  }
  const clearRules = () => {
    rules.length = 0;
  }
  const resetRules = (newRules:string[]=[]) => {
    clearRules();
    rules.push(...newRules);
  }
  return { addRule, listRules, removeRule, resetRules };
}

const eventBridgeMock = EventBridgeMock();

const PoolMock = class extends AbstractPool {
  constructor(maxRuleLimit:number) {
    super(maxRuleLimit);
  }
  public loadInventory = async (): Promise<void> => {
    const { loadRule } = this;
    const ruleStrings = eventBridgeMock.listRules();
    for(const ruleString of ruleStrings) {
      const [busName, ruleName] = ruleString.split('__');
      const rule = new RuleMock();
      rule.setName(ruleName);
      loadRule(rule, busName);
    }
  }
  public loadEventBus = (index: number):AbstractEventBus => {
    const bus = new EventBusMock(index);
    this.busesInventory.set(bus.getName(), bus);
    return bus;
  }
  public createEventBus = async (index:number): Promise<AbstractEventBus> => {
    const bus = await new EventBusMock(index).create();
    this.busesInventory.set(bus.getName(), bus);
    return bus;
  }
};

const EventBusMock = class extends AbstractEventBus {
  constructor(index:number) {
    super(index);
  }
  public create = async (): Promise<AbstractEventBus> => {
    return this;
  }
  public delete = async (): Promise<void>=> {
    return;
  }
  public getName = (): string => {
    if( ! this.busName) {
      this.busName = `event-bus-${this.index}`;
    }
    return this.busName;
  }
};

const RuleMock = class extends AbstractEventBusRule {
  public create = async (parentBus: AbstractEventBus): Promise<AbstractEventBusRule> =>{
    this.parentBus = parentBus;
    parentBus.setRule(this);
    // CLI would be called here to create the rule
    return this;
  }
  public getName = ():string => {
    if( ! this.ruleName) {
      this.ruleName = `${this.parentBus.getName()}-rule-${uuidv4()}`
    }
    return this.ruleName;
  }
};

describe('Add rules until spill-over', () => {

  it('Should create a new event bus for the very first rule', async () => {
    const pool = new PoolMock(3);
    await pool.loadInventory();
    expect(pool.getEventBusCount()).toBe(0);
    await pool.addRule(new RuleMock());
    expect(pool.getEventBusCount()).toBe(1);
  });

  it('Should create buses every time the max rule count is reached when starting from scratch', async () => {
    const pool = new PoolMock(3);
    await pool.loadInventory();
    expect(pool.getEventBusCount()).toBe(0);
    await pool.addRule(new RuleMock());
    expect(pool.getEventBusCount()).toBe(1);
    await pool.addRule(new RuleMock());
    expect(pool.getEventBusCount()).toBe(1);
    await pool.addRule(new RuleMock());
    expect(pool.getEventBusCount()).toBe(1);
    await pool.addRule(new RuleMock());
    expect(pool.getEventBusCount()).toBe(2);
    await pool.addRule(new RuleMock());
    expect(pool.getEventBusCount()).toBe(2);
    await pool.addRule(new RuleMock());
    expect(pool.getEventBusCount()).toBe(2);
    await pool.addRule(new RuleMock());
    expect(pool.getEventBusCount()).toBe(3);
  });

  it('Should create a new event bus once the max rule count is reached for pre-existing event buses', async () => {    
    const bus1Name = 'event-bus-1';
    const bus2Name = 'event-bus-2';

    eventBridgeMock.resetRules();
    eventBridgeMock.addRule(`${bus1Name}-rule-${uuidv4()}`, bus1Name);
    eventBridgeMock.addRule(`${bus1Name}-rule-${uuidv4()}`, bus1Name);
    const pool = new PoolMock(3);
    await pool.loadInventory();

    // Assert the correct initial state
    expect(pool.getEventBusCount()).toBe(1);
    let bus1 = pool.getLoadedEventBus(bus1Name);
    expect(bus1).toBeDefined();    
    expect(bus1!.getRuleCount()).toBe(2);

    // Add the first new rule (should NOT create "spill-over" bus)
    await pool.addRule(new RuleMock());
    expect(pool.getEventBusCount()).toBe(1);
    bus1 = pool.getLoadedEventBus(bus1Name);
    expect(bus1).toBeDefined();    
    expect(bus1!.getRuleCount()).toBe(3);

    // Add the second new rule (should create "spill-over" bus)
    await pool.addRule(new RuleMock());
    expect(pool.getEventBusCount()).toBe(2);
    let bus2 = pool.getLoadedEventBus(bus2Name);
    expect(bus2).toBeDefined();
    expect(bus2!.getRuleCount()).toBe(1);
  });

  it('Should fill in any free spot in the "heaviest" bus that is still under the limit:TEST 1', async () => {
    const bus1Name = 'event-bus-1';
    const bus2Name = 'event-bus-2';

    eventBridgeMock.resetRules();
    eventBridgeMock.addRule(`${bus1Name}-rule-${uuidv4()}`, bus1Name);
    eventBridgeMock.addRule(`${bus1Name}-rule-${uuidv4()}`, bus1Name);
    eventBridgeMock.addRule(`${bus2Name}-rule-${uuidv4()}`, bus2Name);
    let pool = new PoolMock(3);
    await pool.loadInventory();

    // Assert the correct initial state
    expect(pool.getEventBusCount()).toBe(2);
    let bus1 = pool.getLoadedEventBus(bus1Name);
    expect(bus1).toBeDefined();    
    expect(bus1!.getRuleCount()).toBe(2);
    let bus2 = pool.getLoadedEventBus(bus2Name);
    expect(bus2).toBeDefined();
    expect(bus2!.getRuleCount()).toBe(1);

    // Add the first new rule (should go to bus 1)
    await pool.addRule(new RuleMock());
    expect(pool.getEventBusCount()).toBe(2);
    bus1 = pool.getLoadedEventBus(bus1Name);
    expect(bus1).toBeDefined();    
    expect(bus1!.getRuleCount()).toBe(3);
    bus2 = pool.getLoadedEventBus(bus2Name);
    expect(bus2).toBeDefined();
    expect(bus2!.getRuleCount()).toBe(1);
  });

  it('Should fill in any free spot in the "heaviest" bus that is still under the limit:TEST 2', async () => {
    const bus1Name = 'event-bus-1';
    const bus2Name = 'event-bus-2';
    const bus3Name = 'event-bus-3';
    const bus4Name = 'event-bus-4';

    eventBridgeMock.resetRules();
    eventBridgeMock.addRule(`${bus1Name}-rule-${uuidv4()}`, bus1Name);
    eventBridgeMock.addRule(`${bus2Name}-rule-${uuidv4()}`, bus2Name);
    eventBridgeMock.addRule(`${bus3Name}-rule-${uuidv4()}`, bus3Name);
    eventBridgeMock.addRule(`${bus3Name}-rule-${uuidv4()}`, bus3Name);
    eventBridgeMock.addRule(`${bus3Name}-rule-${uuidv4()}`, bus3Name);
    eventBridgeMock.addRule(`${bus4Name}-rule-${uuidv4()}`, bus4Name);
    eventBridgeMock.addRule(`${bus4Name}-rule-${uuidv4()}`, bus4Name);
    let pool = new PoolMock(3);
    await pool.loadInventory();

    const assertBus1Through3 = () => {
      expect(pool.getEventBusCount()).toBe(4);
      const bus1 = pool.getLoadedEventBus(bus1Name);
      expect(bus1).toBeDefined();
      expect(bus1!.getRuleCount()).toBe(1);
      const bus2 = pool.getLoadedEventBus(bus2Name);
      expect(bus2).toBeDefined();
      expect(bus2!.getRuleCount()).toBe(1);
      let bus3 = pool.getLoadedEventBus(bus3Name);
      expect(bus3).toBeDefined();
      expect(bus3!.getRuleCount()).toBe(3);
    }

    // Assert the correct initial state
    assertBus1Through3();
    let bus4 = pool.getLoadedEventBus(bus4Name);
    expect(bus4).toBeDefined();
    expect(bus4!.getRuleCount()).toBe(2);

    // Add the first new rule (should go to bus 4)
    await pool.addRule(new RuleMock());
    assertBus1Through3();
    bus4 = pool.getLoadedEventBus(bus4Name);
    expect(bus4).toBeDefined();
    expect(bus4!.getRuleCount()).toBe(3);

    // Add the second new rule (should go to bus 1 or 2: total will be 3)
    await pool.addRule(new RuleMock());
    expect(pool.getEventBusCount()).toBe(4);
    const bus1 = pool.getLoadedEventBus(bus1Name);
    const bus2 = pool.getLoadedEventBus(bus2Name);
    expect(bus1!.getRuleCount() + bus2!.getRuleCount()).toBe(3);
  });

});