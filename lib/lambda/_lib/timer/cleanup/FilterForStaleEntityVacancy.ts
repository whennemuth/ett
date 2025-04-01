import { ScheduleSummary } from "@aws-sdk/client-scheduler";
import { ID as scheduleId, StaleVacancyLambdaParms } from "../../../functions/delayed-execution/HandleStaleEntityVacancy";
import { log } from "../../../Utils";
import { getPrefix } from "../DelayedExecution";
import { ISchedulesCache } from "./Cache";
import { Filter, SelectionParms } from "./Cleanup";

/**
 * This class is used to filter for stale entity vacancy schedules that are "orphaned".
 */
export class FilterForStaleEntityVacancy implements Filter {
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
        const { entity_id } = lambdaInput as StaleVacancyLambdaParms;
        return await entityDoesNotExist(entity_id);
      }
    } as SelectionParms;
  }
}