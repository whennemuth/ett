import { ScheduleSummary } from "@aws-sdk/client-scheduler";
import { log } from "console";
import { DisclosureItemsParms } from "../../../functions/consenting-person/BucketItem";
import { BucketItemMetadata } from "../../../functions/consenting-person/BucketItemMetadata";
import { ID as scheduleId } from "../../../functions/delayed-execution/PurgeExhibitFormFromBucket";
import { getPrefix } from "../DelayedExecution";
import { ISchedulesCache } from "./Cache";
import { CleanupParms, Filter, SelectionParms } from "./Cleanup";

/**
 * This class is used to filter for bucket exhibit form purge schedules that are "orphaned".
 */
export class FilterForPurgeExhibitFormFromBucket implements Filter {
  private cleanupParms:CleanupParms;

  constructor(cleanupParms:CleanupParms) {
    this.cleanupParms = cleanupParms;
  }

  public matchForSchedule = (schedule:ScheduleSummary):boolean => {
    const startOfName = `${getPrefix()}-${scheduleId}-`;
    return schedule.Name ? schedule.Name.startsWith(startOfName) : false;
  };


  public getFilter = async (cache:ISchedulesCache):Promise<SelectionParms> => {
    const { cleanupParms, matchForSchedule } = this;
    const { entityDoesNotExist, consenterDoesNotExist } = cache;

    log(`Getting selection criteria for: ${scheduleId}`);
    
    return {
      region: cleanupParms.region,
      scheduleFilter: (schedule:ScheduleSummary):boolean => matchForSchedule(schedule),
      inputFilter: async (lambdaInput:any):Promise<boolean> => {
        const { s3ObjectKeyForExhibitForm } = lambdaInput as DisclosureItemsParms;
        const { fromBucketObjectKey } = BucketItemMetadata;
        const parms = fromBucketObjectKey(s3ObjectKeyForExhibitForm);
        const { entityId, consenterEmail } = parms;
        if(await entityDoesNotExist(entityId)) {
          return true;
        }
        if(entityId == cleanupParms?.entityId) {
          return true;
        }
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