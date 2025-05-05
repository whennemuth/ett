import { GetScheduleCommand, GetScheduleCommandInput, GetScheduleOutput, ListSchedulesCommand, ListSchedulesCommandInput, ListSchedulesCommandOutput, SchedulerClient, ScheduleSummary, Target } from "@aws-sdk/client-scheduler";
import { getGroupName } from "./DelayedExecution";
import { log, error } from "../../Utils";
import { IContext } from "../../../../contexts/IContext";
import { DisclosureRequestReminderLambdaParms, ID } from "../../functions/delayed-execution/SendDisclosureRequestReminder";
import { BucketItemMetadata } from "../../functions/consenting-person/BucketItemMetadata";

export type TargetInputFilterFunction = (targetInput:string|undefined) => boolean;

export type SchedulesLookupParms = {
  region:string,
  landscape:string,
  scheduleTypeId?:string,
  targetInputFilter?:TargetInputFilterFunction
}

/**
 * Get all schedules for the specified landscape, group name, and optionally schedule type 
 * (schedule name begins with "ett-${landscape}-{scheduleType}-").
 * @param region 
 * @returns 
 */
export const lookupAllSchedules = async (lookupParms:SchedulesLookupParms):Promise<ScheduleSummary[]> => {
  const { region, landscape, scheduleTypeId } = lookupParms;
  const allSchedules = [] as ScheduleSummary[];

  // Configure the SDK client call
  let NamePrefix = 'ett-';
  let groupName:string|undefined = undefined;
  groupName = getGroupName(`${NamePrefix}${landscape}`)
  NamePrefix = NamePrefix + landscape + '-';
  if(scheduleTypeId) {
    NamePrefix = NamePrefix + scheduleTypeId + '-';
  }
  const pageSize = 10;
  let next_token:string|undefined = 'START';

  // Create the SDK client
  const client = new SchedulerClient({ region });

  // Run the SDK client and load the results into the array
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

  // Return the lookup results
  return allSchedules;
}

export const lookupSpecificSchedules = async (lookupParms:SchedulesLookupParms, findFirst:boolean=false):Promise<Target[]> => {
  const targets = [] as Target[];
  const schedules = await lookupAllSchedules(lookupParms);
  const { targetInputFilter:filter, region } = lookupParms;
  for(const schedule of schedules) {
    if( ! schedule.Name) continue;
    const { Name, GroupName } = schedule;
    const details = await lookupScheduleDetails(Name, region, GroupName);
    if( ! details) continue;
    const { Target } = details;
    if( ! Target?.Input) continue;
    if(filter) {
      if( ! filter(Target.Input)) continue;
    }
    targets.push(Target);
    if(findFirst) {
      break;
    }
  }
  return targets;
}

export const hasSpecificSchedules = async (lookupParms:SchedulesLookupParms):Promise<boolean> => {
  const targets = await lookupSpecificSchedules(lookupParms, true);
  return targets.length > 0;
}

/**
 * Use the SDK to lookup the specified schedule.
 * @param Name 
 * @param region 
 * @param GroupName 
 * @returns 
 */
export const lookupScheduleDetails = async (Name:string, region:string, GroupName?:string):Promise<GetScheduleOutput> => {
  log({ Name, GroupName }, `Looking up target for schedule`);
  const client = new SchedulerClient({ region });
  const commandInput = { Name, GroupName } as GetScheduleCommandInput;
  const command = new GetScheduleCommand(commandInput);
  const response = await client.send(command) as GetScheduleOutput;
  return response;
}





/**
 * RUN MANUALLY
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/timer/Lookup.ts')) {

  const consenter_email = 'cp1@warhen.work'
  const entity_id = 'a27ef181-db7f-4e18-ade4-6a987d82e248';
  const affiliate_email = 'affiliate3@warhen.work';

  (async () => {
    // Cleanup orphaned event bridge schedules for the current landscape and specific target.
    const context:IContext = await require('../../../../contexts/context.json');
    const { REGION:region, TAGS: { Landscape:landscape }} = context;
    let found = false;

    try {
      found = await hasSpecificSchedules({ 
        region, 
        landscape,
        scheduleTypeId: ID,
        targetInputFilter: (targetInput:string|undefined):boolean => {
          if( ! targetInput) return false;
          const { lambdaInput } = JSON.parse(targetInput);
          const { 
            disclosureEmailParms: { s3ObjectKeyForExhibitForm } 
          } = lambdaInput as DisclosureRequestReminderLambdaParms
          const { 
            entityId, affiliateEmail, consenterEmail 
          } = BucketItemMetadata.fromBucketObjectKey(s3ObjectKeyForExhibitForm);
          return entityId === entity_id &&
            consenterEmail === consenter_email &&
            affiliateEmail === affiliate_email;
        }
      });
    }
    catch(e) {
      error(e);
    }
    finally {
      console.log(`${found ? 'One or more' : 'No'} schedules found`);
    }
  })();
}

