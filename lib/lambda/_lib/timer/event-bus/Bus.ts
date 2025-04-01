import { CreateEventBusCommand, DeleteEventBusCommand, EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { IContext } from "../../../../../contexts/IContext";
import * as ctx from '../../../../../contexts/context.json';
import { AbstractEventBus } from "./Abstract";
import { EttRule } from "./Rule";
import { lookupRules } from "./Utils";

/**
 * This class represents an event bus for all rules related to delayed executions for a specified landscape.
 * It can be one of many such event buses for the landscape.
 */
export class EttEventBus extends AbstractEventBus {
  private NamePrefix:string;
  private region:string;

  constructor(namePrefix:string, index:number) {
    super(index);
    this.NamePrefix = namePrefix.endsWith('-') ? namePrefix.substring(0, namePrefix.length-1) : namePrefix;
    let { REGION: region } = process.env
    const { REGION } = ctx as IContext;
    this.region = region ?? REGION;
  }

  public create = async (): Promise<AbstractEventBus> => {
    const { region, getName } = this;
    const eventBridgeClient = new EventBridgeClient({ region });
    try {
      await eventBridgeClient.send(new CreateEventBusCommand({ Name: getName() }));
    }
    catch(e: any) {
      if (e.name === 'ResourceAlreadyExistsException') {
        console.error(`Event bus ${getName()} already exists.`);
      }
      else {
        throw e;
      }
    }
    return this;
  }

  public delete = async (): Promise<void>=> {
    const { region, getName } = this;
    const eventBridgeClient = new EventBridgeClient({ region });
    try {
      await eventBridgeClient.send(new DeleteEventBusCommand({ Name: getName() }));
    } 
    catch (e: any) {
      if (e.name === 'ResourceInUseException') {
        console.error(`Cannot delete event bus ${getName()} because it has rules associated with it.`);
      } 
      else {
        throw e;
      }
    }
  }

  public getName = (): string => {
    const { NamePrefix: namePrefix, } = this;
    if( ! this.busName) {
      this.busName = `${namePrefix}-${this.index}`;
    }
    return this.busName;
  }

  public async loadRules(index: number): Promise<void> {
    const { NamePrefix, region  } = this;
    const allRules = [] as EttRule[];
    const busName = index == 0 ? 'default' : `${NamePrefix}-${index}`;
    const rules = await lookupRules(NamePrefix, region, busName);
    for(const rule of rules) {
      allRules.push(new EttRule(rule));
    };
  } 
}