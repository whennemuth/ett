import { ListSchedulesCommand, ListSchedulesCommandInput, ListSchedulesCommandOutput, SchedulerClient, ScheduleSummary } from "@aws-sdk/client-scheduler";
import { error } from "../../../Utils";
import { ConsenterCrud } from "../../dao/dao-consenter";
import { EntityCrud } from "../../dao/dao-entity";
import { Consenter, Entity } from "../../dao/entity";
import { getGroupName } from "../DelayedExecution";

export interface ISchedulesCache {
  getAllSchedules(landscape:string|undefined):Promise<ScheduleSummary[]>
  getDeletedSchedules():string[]
  entityDoesNotExist(entityId:string):Promise<boolean>
  consenterDoesNotExist(consenterEmail:string):Promise<boolean>
  deleteSchedule(scheduleName:string):void
  scheduleIsDeleted(scheduleName:string):boolean
}

/**
 * This class is used to cache schedules, entities, and consenters so as to avoid making extraneous repeat SDK calls.
 */
export class SchedulesCache implements ISchedulesCache {
  private schedulesCache:Map<string, ScheduleSummary[]> = new Map();
  private deletedSchedules:string[] = [] as string[];
  private entityIdCache:string[] = [];
  private missingConsenterEmails:string[] = [];
  private foundConsenterEmails:string[] = [];
  private region:string;

  constructor(region:string) {
    this.region = region;
  }

  /**
   * Get all schedules for the specified landscape and group name (schedule name begins with ett-${landscape}-).
   * First time call for a landscape will trigger a SDK lookup and a cache of the results.
   * Subsequent calls for the same landscape will use the cache.
   * @param region 
   * @returns 
   */
  public getAllSchedules = async (landscape:string|undefined):Promise<ScheduleSummary[]> => {
    const { schedulesCache, region } = this;
    if( ! landscape) {
      error(`Landscape not set`);
      return [];
    }
    if(schedulesCache.has(landscape)) {
      return schedulesCache.get(landscape) as ScheduleSummary[];
    }
    let NamePrefix = 'ett-';
    let groupName:string|undefined = undefined;
    if(landscape) {
      groupName = getGroupName(`${NamePrefix}${landscape}`)
      NamePrefix = NamePrefix + landscape + '-';
    }
    const client = new SchedulerClient({ region });
    const pageSize = 10;
    const allSchedules = [] as ScheduleSummary[];
    let next_token:string|undefined = 'START';


    while(next_token) {
      console.log(`Getting ${next_token == 'START' ? 'first' : 'next'} set of ${pageSize} schedule summaries...`);
      const input = { NamePrefix, Limit: Number(pageSize) } as ListSchedulesCommandInput;
      if(groupName) input.GroupName = groupName;
      if(next_token !== 'START') {
        input.NextToken = next_token;
      }
      const command = new ListSchedulesCommand(input);
      const response = await client.send(command) as ListSchedulesCommandOutput;
      const { NextToken:token, Schedules } = response;
      next_token = token;
      if(Schedules) {
        for(const schedule of Schedules) {
          allSchedules.push(schedule);
        };
      }
    }
    schedulesCache.set(landscape, allSchedules);
    return allSchedules;
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
    const consenter = await ConsenterCrud({ consenterInfo: { email:consenterEmail } as Consenter }).read() as Consenter;
    if(consenter) {
      foundConsenterEmails.push(consenterEmail);
      return false;
    }
    missingConsenterEmails.push(consenterEmail);
    return true;
  }

  public getDeletedSchedules = ():string[] => {
    return this.deletedSchedules;
  }
  
  public deleteSchedule = (scheduleName:string):void => {
    this.deletedSchedules.push(scheduleName);
  }

  public scheduleIsDeleted = (scheduleName:string):boolean => {
    return this.deletedSchedules.includes(scheduleName);
  }
}