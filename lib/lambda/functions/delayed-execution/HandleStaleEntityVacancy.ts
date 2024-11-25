import { CONFIG, IContext } from "../../../../contexts/IContext";
import { DelayedExecutions } from "../../../DelayedExecution";
import { lookupUserPoolId } from "../../_lib/cognito/Lookup";
import { Configurations, IAppConfig } from "../../_lib/config/Config";
import { EntityCrud } from "../../_lib/dao/dao-entity";
import { ConfigNames, Entity, Roles, User } from "../../_lib/dao/entity";
import { EntityToAutomate } from "../../_lib/EntityAutomation";
import { DelayedLambdaExecution, PostExecution, ScheduledLambdaInput } from "../../_lib/timer/DelayedExecution";
import { humanReadableFromSeconds } from "../../_lib/timer/DurationConverter";
import { EggTimer, PeriodType } from "../../_lib/timer/EggTimer";
import { debugLog, log } from "../../Utils";
import { Personnel } from "../authorized-individual/correction/EntityPersonnel";
import { EntityState } from "../authorized-individual/correction/EntityState";
import { EntityToDemolish } from "../authorized-individual/Demolition";
import { ExhibitFormsBucketEnvironmentVariableName } from "../consenting-person/BucketItemMetadata";

export type StaleVacancyLambdaParms = {
  entity_id: string
}

/**
 * This lambda is triggered by one-time event bridge rules to check an entity for having a vacancy in one of
 * its roles that has lasted longer than the allowable duration. If an entity is found to be in such a state,
 * it is terminated as an entity.
 * @param event 
 * @param context 
 */
export const handler = async(event:ScheduledLambdaInput, context:any) => {
  const { lambdaInput, eventBridgeRuleName, targetId } = event;
  const { entity_id } = lambdaInput as StaleVacancyLambdaParms;
  const dryrun:boolean = process.env.DRYRUN === 'true';

  try {
    debugLog({ event, context });
    log(entity_id, 'Processing with the following input parameter');

    if( ! entity_id) {
      log(`INVALID INPUT: entity_id is missing!`);
    }

    const stateOfEntity = await EntityState.getInstance(new Personnel({ entity:entity_id }));
    const { isUnderStaffed, ASPVacancy, AIVacancy, exceededRoleVacancyTimeLimit, getEntity, getOverUnderTime, getReport } = stateOfEntity;
    const { entity_name } = getEntity();

    if(isUnderStaffed()) {
      
      log(`${entity_name} is understaffed`);
      const configs = new Configurations();
      const { STALE_ASP_VACANCY, STALE_AI_VACANCY } = ConfigNames;
      let violation = false;
      let config:IAppConfig = {} as IAppConfig;

      if(ASPVacancy()) {
        log(`${entity_name} has an ASP vacancy`);
        config = await configs.getAppConfig(STALE_ASP_VACANCY) as IAppConfig;
        if(await exceededRoleVacancyTimeLimit(Roles.RE_ADMIN, config)) {
          const info = {
            limit: humanReadableFromSeconds(config.getDuration()),
            exceededBy: getOverUnderTime() ?? 'unknown',
            report: getReport()
          }
          log(info, `${entity_name} ASP vacancy has exceeded the allowed limit`);
          violation = true;
        }
      }

      if(AIVacancy() && ! violation) {
        log(`${entity_name} has an authorized individual vacancy`);
        config = await configs.getAppConfig(STALE_AI_VACANCY) as IAppConfig;
        if(await exceededRoleVacancyTimeLimit(Roles.RE_AUTH_IND, config)) {
          const info = {
            limit: humanReadableFromSeconds(config.getDuration()),
            exceededBy: getOverUnderTime() ?? 'unknown',
            report: getReport()
          }
          log(info, `${entity_name} authorized individual vacancy has exceeded the allowed limit`);
          violation = true;
        }
      }

      if(violation) {
        log(`${entity_name} is in violation of role vacancy policy and will be terminated`);
        const entityToDemolish = new EntityToDemolish(entity_id);
        entityToDemolish.dryRun = dryrun;
        await entityToDemolish.demolish();
      }
      else {
        const limit = config.getDuration ? config.getDuration() : 0;
        const info = {
          limit: limit == 0 ? 'unknown' : humanReadableFromSeconds(limit),
          remainingTime: getOverUnderTime() ?? 'unknown',
          report: getReport()
        }
        log(info, `${entity_name} is NOT yet in violation of role vacancy policy`);
      }
    }
    else {
      log(`${entity_name} is NOT understaffed`);
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
 * RUN MANUALLY
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/delayed-execution/HandleStaleEntityVacancy.ts')) {

  (async () => {
    // Get values from the context and lookups
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, REGION, ACCOUNT, TAGS: { Landscape }} = context;
    const prefix = `${STACK_ID}-${Landscape}`;
    const bucketName = `${prefix}-exhibit-forms`;
    const userpoolId = await lookupUserPoolId(`${STACK_ID}-${Landscape}-cognito-userpool`, REGION);
    
    // Load environment variables
    process.env[ExhibitFormsBucketEnvironmentVariableName] = bucketName;
    process.env.USERPOOL_ID = userpoolId;
    process.env.PREFIX = prefix;
    process.env.REGION = REGION;

    // Create a reduced app config just for this test
    const { STALE_AI_VACANCY, STALE_ASP_VACANCY } = ConfigNames;
    const configs = { useDatabase:false, configs: [
      { name: STALE_AI_VACANCY, value: '60', config_type: 'duration', description: 'testing' },
      { name: STALE_ASP_VACANCY, value: '60', config_type: 'duration', description: 'testing' },
    ]} as CONFIG;
    process.env[Configurations.ENV_VAR_NAME] = JSON.stringify(configs);

    const { MINUTES } = PeriodType;
  

    /**
     * Create a delayed execution that will handle any stale vacancy violations.
     * @param lambdaInput 
     * @param callback 
     */
    const createDelayedExecutionToHandleStaleVacancy = async (lambdaInput:StaleVacancyLambdaParms, callback:Function) => {
      const functionName = `${prefix}-${DelayedExecutions.HandleStaleEntityVacancy.coreName}`;
      const lambdaArn = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${functionName}`;
      await callback(lambdaArn, lambdaInput);
    }

    const entityName = 'The School of Hard Knocks';
    const stage = 'execute' as 'setup' | 'execute' | 'teardown';
    const executionType = 'scheduled' as 'immediate' | 'scheduled';
  
    switch(stage) {
      case "setup":
        await new EntityToAutomate(entityName)
            .addAsp({ email:'asp1.random.edu@warhen.work' } as User)
            .addAI( { email:'auth1.random.edu@warhen.work' } as User)
            .addAI( { email:'auth2.random.edu@warhen.work' } as User)
            .setup();
        break;
      case "execute":
        let callback;
        const entity:Entity = (await EntityCrud({ entity_name_lower: entityName.toLowerCase()} as Entity).read() as Entity[])[0];
        const { entity_id } = entity;
        const lambdaInput = { entity_id };

        switch(executionType) {
          case "immediate":
            callback = async (lambdaArn:string, lambdaInput:StaleVacancyLambdaParms) => {
              await handler({ lambdaInput } as ScheduledLambdaInput, null);
            };
            await createDelayedExecutionToHandleStaleVacancy(lambdaInput, callback);
            break;
          case "scheduled":
            callback = async (lambdaArn:string, lambdaInput:StaleVacancyLambdaParms) => {
              const delayedTestExecution = new DelayedLambdaExecution(lambdaArn, lambdaInput);
              const timer = EggTimer.getInstanceSetFor(2, MINUTES); 
              await delayedTestExecution.startCountdown(timer, `Handle stale entity vacancy (TESTING)`);
            };
            await createDelayedExecutionToHandleStaleVacancy(lambdaInput, callback);
            break;
        }
        break;
      case "teardown":
         await new EntityToAutomate(entityName).teardown();
        break;
    }
  })();
}
