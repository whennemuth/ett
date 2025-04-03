import { ScheduleSummary } from "@aws-sdk/client-scheduler";
import { ID as scheduleId, StaleInvitationLambdaParms } from "../../../functions/delayed-execution/RemoveStaleInvitations";
import { log } from "../../../Utils";
import { getPrefix } from "../DelayedExecution";
import { ISchedulesCache } from "./Cache";
import { Filter, SelectionParms } from "./Cleanup";

export class FilterForStaleInvitation implements Filter {
  private region:string;

  constructor(region:string) {
    this.region = region;
  }

  public matchForSchedule = (schedule:ScheduleSummary):boolean => {
    const startOfName = `${getPrefix()}-${scheduleId}-`;
    return schedule.Name ? schedule.Name.startsWith(startOfName) : false;
  };

  public getFilter = async (cache:ISchedulesCache):Promise<SelectionParms> => {
    const { region, matchForSchedule } = this;
    const { entityDoesNotExist } = cache;

    log(`Getting selection criteria for: ${scheduleId}`);

    return {
      region,
      scheduleFilter: (schedule:ScheduleSummary):boolean => matchForSchedule(schedule),
      inputFilter: async (lambdaInput:any):Promise<boolean> => {
        const { email, invitationCode, entity_id } = lambdaInput as StaleInvitationLambdaParms;
        if( ! entity_id) {
          false; // If entity_id is not provided, then the entity must be assumed extant and 
          // any corresponding schedule cannot be included in the filter for removal.
        }
        return await entityDoesNotExist(entity_id!);        
      }
    } as SelectionParms;
  }
        
}