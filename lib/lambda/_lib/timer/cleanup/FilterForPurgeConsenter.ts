import { ScheduleSummary } from "@aws-sdk/client-scheduler";
import { ID as scheduleTypeId } from "../../../functions/delayed-execution/PurgeConsenter";
import { log } from "../../../Utils";
import { getPrefix } from "../DelayedExecution";
import { ISchedulesCache } from "./Cache";
import { CleanupParms, Filter, SelectionParms } from "./Cleanup";

export class FilterForPurgeConsenter implements Filter {
  private cleanupParms:CleanupParms;

  constructor(cleanupParms:CleanupParms) {
    this.cleanupParms = cleanupParms;
  }

  public matchForSchedule = (schedule:ScheduleSummary):boolean => {
    const startOfName = `${getPrefix()}-${scheduleTypeId}-`;
    return schedule.Name ? schedule.Name.startsWith(startOfName) : false;
  };

  public getFilter = async (cache:ISchedulesCache):Promise<SelectionParms> => {
    const { cleanupParms, matchForSchedule } = this;
    const { consenterDoesNotExist } = cache; 
     
    log(`Getting selection criteria for: ${scheduleTypeId}`);
    
    return {
      region: cleanupParms.region,
      scheduleFilter: (schedule:ScheduleSummary):boolean => matchForSchedule(schedule),
      inputFilter: async (lambdaInput:any):Promise<boolean> => {
        const { consenterEmail } = lambdaInput;
        if(await consenterDoesNotExist(consenterEmail)) {
          return true;
        }
        if(consenterEmail == cleanupParms?.consenterEmail) {
          return true;
        }
        return false;
      }
    } as SelectionParms;
  }
}