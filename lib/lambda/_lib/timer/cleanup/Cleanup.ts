import { ScheduleSummary } from "@aws-sdk/client-scheduler";
import { IContext } from "../../../../../contexts/IContext";
import { log } from "../../../Utils";
import { getPrefix, PostExecution, ScheduledLambdaInput } from "../DelayedExecution";
import { humanReadableFromMilliseconds } from "../DurationConverter";
import { EggTimer } from "../EggTimer";
import { lookupScheduleDetails } from "../Lookup";
import { ISchedulesCache, SchedulesCache } from "./Cache";
import { FilterForStaleEntityVacancy } from "./FilterForStaleEntityVacancy";

export type CleanupParms = {
  region:string,
  landscape:string,
  entityId?:string,
  consenterEmail?:string
}

export type SelectionParms = {
  region:string,
  scheduleFilter:(schedule:ScheduleSummary) => boolean,
  inputFilter: (lambdaInput:any) => Promise<boolean>
}

export type SelectionResult = {
  schedule:ScheduleSummary,
  lambdaInput:ScheduledLambdaInput,
  timeRemaining:number,
}

export type Filter = {
  getFilter: (cache:ISchedulesCache) => Promise<SelectionParms>
  matchForSchedule: (schedule:ScheduleSummary) => boolean
}

export const defaultMatchForSchedule = (schedule:ScheduleSummary, scheduleTypeId:string):boolean => {
  const startOfName = `${getPrefix()}-${scheduleTypeId}-`;
  return schedule.Name ? schedule.Name.startsWith(startOfName) : false;
}

/**
 * This class is used to clean up event bridge schedules that have become orphaned because the corresponding
 * entity, landscape, or consenter have been purged from the system.
 */
export class Cleanup {
  private cleanupParms: CleanupParms;
  private dryrun: boolean;
  private cache: ISchedulesCache;
  private filters: Filter[];

  constructor(cleanupParms:CleanupParms, filters:Filter[], cache:ISchedulesCache = new SchedulesCache(cleanupParms.region)) {
    this.cleanupParms = cleanupParms;
    this.cache = cache;
    this.filters = filters;
  }

  public setLandscape = (landscape:string):void => {
    this.cleanupParms.landscape = landscape;
  }

  public setFilters = (filters:Filter[]):void => {
    this.filters = filters;
  }
  public getFilters = ():Filter[] => {
    return this.filters;
  }
  public getDeletedSchedules = ():string[] => {
    return this.cache.getDeletedSchedules();
  }

  /**
   * Apply provided filters to the schedules for the specific landscape and target and return the resulting subset.
   * @param selectionParms 
   * @returns 
   */
  private selectApplicableSchedules = async (selectionParms:SelectionParms): Promise<SelectionResult[]> => {
    const { cache: { getAllSchedules }, cleanupParms: { landscape } } = this;
    const { region, scheduleFilter, inputFilter } = selectionParms;
    const selectionResults = [] as SelectionResult[];
    const schedules = await getAllSchedules(landscape);

    for(const schedule of schedules) {
      if( ! schedule.Name) continue;
      if( ! scheduleFilter(schedule)) continue;
      const { Name, GroupName } = schedule;
      const details = await lookupScheduleDetails(Name, region, GroupName);
      if( ! details) continue;
      const { Target, ScheduleExpression } = details;
      if( ! Target) continue;
      const { Input } = Target;
      if( ! Input) continue;
      const input = JSON.parse(Input) as ScheduledLambdaInput;
      const { lambdaInput } = input;
      if( ! lambdaInput) continue;
      if( ! await inputFilter(lambdaInput)) continue;
      let timeRemaining:number = -1;
      if(ScheduleExpression) {
        const date = EggTimer.fromCronExpression(ScheduleExpression);
        timeRemaining = date.getTime() - Date.now();
      }
      selectionResults.push({ schedule, lambdaInput, timeRemaining });
    };

    return selectionResults;
  }

  private getSchedulesToDelete = async ():Promise<SelectionResult[]> => {
    const { cache, filters, selectApplicableSchedules} = this;
    const selectionResults = [] as SelectionResult[];

    for(const filter of filters) {
      const selectionParms = await filter.getFilter(cache);
      selectionResults.push(...(await selectApplicableSchedules(selectionParms)));
    }

    return selectionResults;
  }


  /**
   * Delete the specified schedule.
   * @param selectionResult 
   * @returns 
   */
  private deleteSchedule = async (selectionResult:SelectionResult):Promise<void> => {
    const { dryrun } = this;
    const { lambdaInput, schedule: { Name, GroupName }, timeRemaining:milliseconds } = selectionResult;
    const timeRemaining = { milliseconds: -1, humanReadable: 'unknown' };
    if(milliseconds > 0) {
      timeRemaining.milliseconds = milliseconds;
      timeRemaining.humanReadable = humanReadableFromMilliseconds(milliseconds);
    }
    const logItem = { timeRemaining, Name, lambdaInput } as any;
  
    if(this.cache.scheduleIsDeleted(Name!)) {
      log(Name, `Schedule already deleted`);
      return;
    }
    if(dryrun) {
      log(logItem, 'DRYRUN - Would delete');
      return;
    }

    log(logItem, 'Deleting');
    if( ! Name) {
      console.log('Schedule name not found!');
      return;
    }
    await PostExecution().cleanup(Name, GroupName!);
    this.cache.deleteSchedule(Name);
  }

  /**
   * Remove any event bridge schedules whose lambda targets receive input that specify entities that no longer exist.
   * @param _dryrun 
   */
  public cleanup = async (_dryrun:boolean=false):Promise<any> => {
    this.dryrun = _dryrun;
    const { getSchedulesToDelete, deleteSchedule, cache: { getAllSchedules }, cleanupParms: { landscape }, filters } = this;
    const schedulesToDelete = await getSchedulesToDelete();
    const candidates = (await getAllSchedules(landscape)).filter((schedule:ScheduleSummary):boolean => {
      return filters.find((filter:Filter):boolean => filter.matchForSchedule(schedule)) ? true : false;
    });
    log( `Found ${schedulesToDelete.length} schedules out of ${candidates.length} to delete`);
    const sorted = schedulesToDelete.sort((a:SelectionResult, b:SelectionResult):number => a.timeRemaining - b.timeRemaining);
    for(const schedule of sorted) {
      await deleteSchedule(schedule);
    };
  }
}




/**
 * RUN MANUALLY
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/timer/cleanup/Cleanup.ts')) {
  (async () => {
    // Cleanup orphaned event bridge schedules for the current landscape and specific target.
    const context:IContext = await require('../../../../../contexts/context.json');
    const { REGION:region, TAGS: { Landscape:landscape }} = context;
    const dryrun:boolean = true;
    const cleanup = new Cleanup({ region, landscape }, [ new FilterForStaleEntityVacancy(region) ]);
    await cleanup.cleanup(dryrun);
  })();
}
