import { CreateEventBusCommand, DeleteEventBusCommand, EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { AbstractEventBus } from "./Abstract";
import { IContext } from "../../../../../contexts/IContext";
import * as ctx from '../../../../../contexts/context.json';

/**
 * This class represents an event bus for all rules related to delayed executions for a specified landscape.
 * It can be one of many such event buses for the landscape.
 */
export class EventBus extends AbstractEventBus {
  private namePrefix:string;
  private region:string;

  constructor(namePrefix:string, index:number) {
    super(index);
    this.namePrefix = namePrefix;
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
    const { namePrefix, } = this;
    if( ! this.busName) {
      this.busName = `${namePrefix}-${this.index}`;
    }
    return this.busName;
  }
}