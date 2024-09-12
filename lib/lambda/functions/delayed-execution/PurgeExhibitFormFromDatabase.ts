import { UpdateItemCommandOutput } from "@aws-sdk/client-dynamodb";
import { DAOFactory } from "../../_lib/dao/dao";
import { Consenter } from "../../_lib/dao/entity";
import { DelayedLambdaExecution, PostExecution, ScheduledLambdaInput } from "../../_lib/timer/DelayedExecution";
import { debugLog, deepClone, log } from "../../Utils";
import { EggTimer, PeriodType } from "../../_lib/timer/EggTimer";
import { IContext } from "../../../../contexts/IContext";
import { EXHIBIT_FORM_DB_PURGE } from "../../../DelayedExecution";


export const handler = async(event:ScheduledLambdaInput, context:any) => {
  const { lambdaInput, eventBridgeRuleName, targetId } = event;
  try {
    debugLog({ event, context });

    const { consenterEmail, entity_id } = lambdaInput ?? {};
    log(`Deleting exhibit form: ${JSON.stringify({ consenterEmail, entity_id })}`);

    const response = await deleteExhibitForm(consenterEmail, entity_id) as UpdateItemCommandOutput;
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
 * @returns 
 */
export const deleteExhibitForm = async (consenterEmail:string, entity_id:string):Promise<UpdateItemCommandOutput|void> => {
  let dao = DAOFactory.getInstance({ DAOType:'consenter', Payload: { email: consenterEmail } as Consenter })
  const oldConsenterInfo = await dao.read({ convertDates: false });
  const newConsenterInfo = deepClone(oldConsenterInfo) as Consenter;
  const { exhibit_forms=[] } = newConsenterInfo;
  const startingFormCount = exhibit_forms.length;

  if(startingFormCount > 0) {
    const filtered = exhibit_forms.filter(ef => {
      return ef.entity_id != entity_id;
    });
    newConsenterInfo.exhibit_forms = filtered;
  }
  const remainingForms = newConsenterInfo.exhibit_forms ?? [];

  if(remainingForms.length == startingFormCount) {
    console.warn(`Attempt to delete exhibit form that does not exist ${JSON.stringify({ consenterEmail, entity_id })}`);
    return;
  }

  dao = DAOFactory.getInstance({ DAOType:'consenter', Payload: newConsenterInfo });
  return dao.update(oldConsenterInfo);
}



/**
 * RUN MANUALLY: Set consenterEmail and entity_id to identify the exhibit form that will be deleted.
 */
const { argv:args } = process;
if(args.length > 3 && args[2] == 'RUN_MANUALLY_PURGE_EXHIBIT_FORM_FROM_DATABASE') {

  const task = args[3] as 'immediate'|'scheduled';
  const { MINUTES } = PeriodType;
  const consenterEmail = 'cp1@warhen.work';
  const entity_id = '8ea27b83-1e13-40b0-9192-8f2ce6a5817d';

  (async () => {
    switch(task) {
      case "immediate":
        await deleteExhibitForm(consenterEmail, entity_id);
        break;
      case "scheduled":
        const context:IContext = await require('../../../../contexts/context.json');
        const { STACK_ID, REGION, ACCOUNT, TAGS: { Landscape }} = context;
        const prefix = `${STACK_ID}-${Landscape}`;
        process.env.PREFIX = prefix;
        process.env.REGION = REGION;
        const functionName = `${prefix}-${EXHIBIT_FORM_DB_PURGE}`;
        const lambdaArn = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${functionName}`;
        const lambdaInput = { consenterEmail, entity_id };
        const delayedTestExecution = new DelayedLambdaExecution(lambdaArn, lambdaInput);
        const timer = EggTimer.getInstanceSetFor(2, MINUTES);
        await delayedTestExecution.startCountdown(timer);
        console.log(`Event bridge rule started for timeout: ${timer.getCronExpression()}`);
        break;
      default:
        console.log(`Unknown task "${task}" specified!`);
        break;
    }
  })();
}