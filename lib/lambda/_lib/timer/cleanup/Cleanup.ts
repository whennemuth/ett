import { EventBridgeClient, ListTargetsByRuleCommand, ListTargetsByRuleCommandInput, Rule, Target } from "@aws-sdk/client-eventbridge";
import { IContext } from "../../../../../contexts/IContext";
import { log } from "../../../Utils";
import { PostExecution, ScheduledLambdaInput } from "../DelayedExecution";
import { humanReadableFromMilliseconds } from "../DurationConverter";
import { EggTimer } from "../EggTimer";
import { IRulesCache, RulesCache } from "./Cache";
import { FilterForStaleEntityVacancy } from "./FilterForStaleEntityVacancy";

export type CleanupParms = {
  region:string,
  landscape:string,
  entityId?:string,
  consenterEmail?:string
}

export type SelectionParms = {
  region:string,
  rulefilter:(rule:Rule) => boolean,
  targetFilter: (lambdaInput:any) => Promise<boolean>
}

export type SelectionResult = {
  rule:Rule,
  target:Target,
  lambdaInput:ScheduledLambdaInput,
  timeRemaining:number,
}

export type Filter = {
  getFilter: (cache:IRulesCache) => Promise<SelectionParms>
  matchForRule: (rule:Rule) => boolean
}

/**
 * This class is used to clean up event bridge rules that have become orphaned because the corresponding
 * entity, landscape, or consenter have been purged from the system.
 */
export class Cleanup {
  private cleanupParms: CleanupParms;
  private dryrun: boolean;
  private cache: IRulesCache;
  private filters: Filter[];

  constructor(cleanupParms:CleanupParms, filters:Filter[], cache:IRulesCache = new RulesCache(cleanupParms.region)) {
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

  /**
   * Apply provided filters to the rules for the specific landscape and target and return the resulting subset.
   * @param selectionParms 
   * @returns 
   */
  private selectApplicableRules = async (selectionParms:SelectionParms): Promise<SelectionResult[]> => {
    const { lookupTarget, cache: { getAllRules }, cleanupParms: { landscape } } = this;
    const { region, rulefilter, targetFilter } = selectionParms;
    const selectionResults = [] as SelectionResult[];
    const rules = await getAllRules(landscape);

    for(const rule of rules) {
      if( ! rule.Name) continue;
      if( ! rulefilter(rule)) continue;
      const target = await lookupTarget(rule.Name, region);
      if( ! target) continue;
      const { Input } = target;
      if( ! Input) continue;
      const input = JSON.parse(Input) as ScheduledLambdaInput;
      const { lambdaInput } = input;
      if( ! lambdaInput) continue;
      if( ! await targetFilter(lambdaInput)) continue;
      const { ScheduleExpression } = rule;
      let timeRemaining:number = -1;
      if(ScheduleExpression) {
        const date = EggTimer.fromCronExpression(ScheduleExpression);
        timeRemaining = date.getTime() - Date.now();
      }
      selectionResults.push({ rule, target, lambdaInput, timeRemaining });
    };

    return selectionResults;
  }

  private getRulesToDelete = async ():Promise<SelectionResult[]> => {
    const { cache, filters, selectApplicableRules} = this;
    const selectionResults = [] as SelectionResult[];

    for(const filter of filters) {
      const selectionParms = await filter.getFilter(cache);
      selectionResults.push(...(await selectApplicableRules(selectionParms)));
    }

    return selectionResults;
  }

  /**
   * Use the SDK to lookup the target for the specified rule.
   * @param Rule 
   * @param region 
   * @returns 
   */
  private lookupTarget = async (Rule:string, region:string):Promise<Target|void> => {
    log(`Looking up target for rule: ${Rule}`);
    const client = new EventBridgeClient({ region });
    const commandInput = { Rule } as ListTargetsByRuleCommandInput;
    const command = new ListTargetsByRuleCommand(commandInput);
    const response = await client.send(command);
    // Should be only one target and it will start with the rule name `${Rule}-targetId`.
    const target = (response.Targets?? [{}] as Target[]).find((target:Target):boolean => (target.Id ?? '').startsWith(Rule));
    if(target) return target;
  }

  /**
   * Delete the specified rule.
   * @param selectionResult 
   * @returns 
   */
  private deleteRule = async (selectionResult:SelectionResult):Promise<void> => {
    const { dryrun } = this;
    const { rule, target, timeRemaining:milliseconds } = selectionResult;
    const timeRemaining = { milliseconds: -1, humanReadable: 'unknown' };
    if(milliseconds > 0) {
      timeRemaining.milliseconds = milliseconds;
      timeRemaining.humanReadable = humanReadableFromMilliseconds(milliseconds);
    }
    const logItem = { timeRemaining, ruleName: rule.Name, target } as any;
    if(dryrun) {
      log(logItem, 'DRYRUN - Would delete');
      return;
    }

    log(logItem, 'Deleting');
    if( ! rule.Name) {
      console.log('Rule name not found!');
      return;
    }
    if( ! target.Id) {
      console.log('Target ID not found!');
      return;
    }
    await PostExecution().cleanup(rule.Name, target.Id);
  }

  public cleanup = async (_dryrun:boolean=false):Promise<any> => {
    this.dryrun = _dryrun;
    const { getRulesToDelete, deleteRule, cache: { getAllRules }, cleanupParms: { landscape }, filters } = this;
    log(' ');
    log(`--------- CLEANING UP ${landscape} ---------`);
    const rulesToDelete = await getRulesToDelete();
    const candidates = (await getAllRules(landscape)).filter((rule:Rule):boolean => {
      return filters.find((filter:Filter):boolean => filter.matchForRule(rule)) ? true : false;
    });
    log( `Found ${rulesToDelete.length} rules out of ${candidates.length} to delete`);
    const sorted = rulesToDelete.sort((a:SelectionResult, b:SelectionResult):number => a.timeRemaining - b.timeRemaining);
    for(const rule of sorted) {
      await deleteRule(rule);
    };
  }
}

const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/timer/cleanup/Cleanup.ts')) {
  (async () => {
    // Cleanup orphaned event bridge rules for the current landscape and specific target.
    const context:IContext = await require('../../../../../contexts/context.json');
    const { REGION:region, TAGS: { Landscape:landscape }} = context;
    const dryrun:boolean = true;
    const cleanup = new Cleanup({ region, landscape }, [ new FilterForStaleEntityVacancy(region) ]);
    await cleanup.cleanup(dryrun);
  })();
}
