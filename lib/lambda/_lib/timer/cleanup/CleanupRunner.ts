import { CloudFormationClient, ListStacksCommand, ListStacksCommandInput, StackSummary } from "@aws-sdk/client-cloudformation";
import { Cleanup, CleanupParms } from "./Cleanup";
import { IContext } from "../../../../../contexts/IContext";
import { FilterForStaleEntityVacancy } from "./FilterForStaleEntityVacancy";
import { FilterForPurgeExhibitFormFromBucket } from "./FilterForPurgeExhibitFormFromBucket";
import { FilterForPurgeExhibitFormFromDatabase } from "./FilterForPurgeExhibitFormFromDatabase";
import { FilterForSendDisclosureRequestReminder } from "./FilterForSendDisclosureRequestReminder";

// If true, the cleanup will only list the rules that would be deleted.
const dryrun:boolean = true;

export type CleanupLandscapeParms = {
  region:string, landscape:string, dryrun:boolean, cleanup?:Cleanup
}

export const cleanupLandscape = async (parms:CleanupLandscapeParms):Promise<void> => {
  let { region, landscape, dryrun, cleanup } = parms;
  const cleanupParms = { region, landscape } as CleanupParms;
  if( ! cleanup) {
    cleanup = new Cleanup(cleanupParms, []);
  }
  if(cleanup.getFilters().length == 0) {
    cleanup.setFilters([ 
      new FilterForStaleEntityVacancy(region),
      new FilterForPurgeExhibitFormFromBucket(cleanupParms),
      new FilterForPurgeExhibitFormFromDatabase(cleanupParms),
      new FilterForSendDisclosureRequestReminder(cleanupParms)
    ]);
  }
  cleanup.setLandscape(landscape);
  await cleanup.cleanup(dryrun);
}

/**
 * This method will perform a global cleanup of all orphaned event bridge rules for every landscape.
 */
(async () => {
  const context:IContext = await require('../../../../../contexts/context.json');
  const { REGION:region } = context;
  
  // 1) Get a list of active stacks for the account.
  const client = new CloudFormationClient({ region });
  const input: ListStacksCommandInput = { StackStatusFilter: [ 'CREATE_COMPLETE', 'UPDATE_COMPLETE' ] };
  const command = new ListStacksCommand(input);
  const response = await client.send(command);

  // 2) Reduce the stacks down to the landscapes for those ETT has been deployed to.
  const landscapes = response.StackSummaries?.map((stack: StackSummary):string|undefined => {
    if(/^ett\-[^\-]+$/.test(`${stack.StackName}`)) {
      return stack.StackName?.split('-')[1];
    }
    return undefined;
  }).filter((landscape:string|undefined):boolean => landscape !== undefined) as string[];

  // 3) Instantiate and configure the cleanup class.
  const cleanupParms = { region, landscape: landscapes[0] } as CleanupParms;
  const cleanup = new Cleanup(cleanupParms, []);

  // 4) Run the cleanup for each landscape.
  for(const landscape of landscapes) {
    await cleanupLandscape({ region, landscape, dryrun, cleanup });
  };
})();