import { UpdateItemCommandOutput } from "@aws-sdk/client-dynamodb";
import { DAOFactory } from "../../_lib/dao/dao";
import { Consenter } from "../../_lib/dao/entity";
import { DelayedLambdaExecution, PostExecution, ScheduledLambdaInput } from "../../_lib/timer/DelayedExecution";
import { debugLog, deepClone, log, warn } from "../../Utils";
import { EggTimer, PeriodType } from "../../_lib/timer/EggTimer";
import { IContext } from "../../../../contexts/IContext";
import { DelayedExecutions } from "../../../DelayedExecution";

export const RulePrefix = 'Dynamodb exhibit form purge';

/**
 * Exhibit forms are prohibited from being stored in the database for longer than a configured period of time.
 * This lambda is triggered by one-time event bridge rules that are scheduled accordingly and will remove the
 * corresponding exhibit forms from the consenter database record.
 * @param event 
 * @param context 
 */
export const handler = async(event:ScheduledLambdaInput, context:any) => {
  const { lambdaInput, eventBridgeRuleName, targetId } = event;
  try {
    debugLog({ event, context });

    const { consenterEmail, entity_id, delaySeconds } = lambdaInput ?? {};
    const delayTime = parseInt(delaySeconds ?? 0) * 1000;

    log({ consenterEmail, entity_id }, `Deleting exhibit form`);

    const response = await deleteExhibitForm(consenterEmail, entity_id, delayTime) as UpdateItemCommandOutput;
    if(response) {
      log({ deletionResponse: response });
    }
  }
  catch(e:any) {
    log(e);
  }
  finally {
    await PostExecution().cleanup(eventBridgeRuleName, targetId);
  }
}

/**
 * Delete a full exhibit form from a consenter record.
 * @param consenterEmail 
 * @param entity_id 
 * @param delayTime The amount of time (in milliseconds) this call scheduled for before being triggered.
 * @returns 
 */
export const deleteExhibitForm = async (consenterEmail:string, entity_id:string, delayTime:number):Promise<UpdateItemCommandOutput|void> => {
  let dao = DAOFactory.getInstance({ DAOType:'consenter', Payload: { email: consenterEmail } as Consenter })
  const oldConsenterInfo = await dao.read({ convertDates: false });
  const newConsenterInfo = deepClone(oldConsenterInfo) as Consenter;
  const { exhibit_forms=[] } = newConsenterInfo;
  const startingFormCount = exhibit_forms.length;

  // Filter away the consenters exhibit forms that are NOT for the specified entity.
  if(startingFormCount > 0) {
    const filtered = exhibit_forms.filter(ef => {
      let { entity_id:id, create_timestamp } = ef;
      if(id != entity_id) return true;

      // Test now for edge case (see NOTE below)
      if( ! create_timestamp) {
        // Huh? This should not happen.
        create_timestamp = new Date().toISOString();
      }
      const scheduled = new Date(Date.now() - delayTime);
      const created = new Date(create_timestamp);
      if(created.getTime() > scheduled.getTime()) {
        /**
         * NOTE: If the user saves the exhibit form, the corresponding database content is removed immediately,
         * in which case, this operation will purge nothing from the database and end as a non-action result.
         * However, if after saving, the user submits another exhibit form for the same enitity, this new
         * database entry should get a new timer, but this existing timer execution will purge it BEFORE its time.
         * So, to account for this, extend this filter so that it removes any exhibit form whose created_date
         * value indicates it was saved LATER than what would have been this executions egg timer starting point.
         * If this is the case, execution will reach this point in code.
         */
        return true;
      }
      return false;
    });
    newConsenterInfo.exhibit_forms = filtered;
  }
  const remainingForms = newConsenterInfo.exhibit_forms ?? [];

  if(remainingForms.length == startingFormCount) {
    warn({ consenterEmail, entity_id }, `Attempt to delete exhibit form that does not exist`);
    return;
  }

  dao = DAOFactory.getInstance({ DAOType:'consenter', Payload: newConsenterInfo });
  return dao.update(oldConsenterInfo);
}



/**
 * RUN MANUALLY: Set consenterEmail and entity_id to identify the exhibit form that will be deleted.
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/delayed-execution/PurgeExhibitFormFromDatabase.ts')) {

  const task = 'scheduled' as 'immediate'|'scheduled';
  const { MINUTES } = PeriodType;
  const consenterEmail = 'cp1@warhen.work';
  const entity_id = '8ea27b83-1e13-40b0-9192-8f2ce6a5817d';

  (async () => {
    switch(task) {
      case "immediate":
        await deleteExhibitForm(consenterEmail, entity_id, 0);
        break;
      case "scheduled":
        const context:IContext = await require('../../../../contexts/context.json');
        const { STACK_ID, REGION, ACCOUNT, TAGS: { Landscape }} = context;
        const prefix = `${STACK_ID}-${Landscape}`;
        process.env.PREFIX = prefix;
        process.env.REGION = REGION;
        const functionName = `${prefix}-${DelayedExecutions.ExhibitFormDbPurge.coreName}`;
        const lambdaArn = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${functionName}`;
        const lambdaInput = { consenterEmail, entity_id };
        const delayedTestExecution = new DelayedLambdaExecution(lambdaArn, lambdaInput);
        const timer = EggTimer.getInstanceSetFor(2, MINUTES);
        await delayedTestExecution.startCountdown(timer, `${RulePrefix} (TESTING)`);
        break;
      default:
        log(`Unknown task "${task}" specified!`);
        break;
    }
  })();
}