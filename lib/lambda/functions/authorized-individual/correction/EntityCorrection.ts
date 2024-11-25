import { IContext } from "../../../../../contexts/IContext";
import { DelayedExecutions } from "../../../../DelayedExecution";
import { lookupUserPoolId } from "../../../_lib/cognito/Lookup";
import { Configurations } from "../../../_lib/config/Config";
import { EntityCrud } from "../../../_lib/dao/dao-entity";
import { ConfigNames, Entity, Role, Roles } from "../../../_lib/dao/entity";
import { DelayedLambdaExecution } from "../../../_lib/timer/DelayedExecution";
import { EggTimer, PeriodType } from "../../../_lib/timer/EggTimer";
import { lookupCloudfrontDomain } from "../../../Utils";
import { StaleVacancyLambdaParms } from "../../delayed-execution/HandleStaleEntityVacancy";
import { Personnel } from "./EntityPersonnel";

/**
 * This class makes changes to an entity by modifying its name and/or swapping out personnel.
 */
export class EntityToCorrect {
  private personnel:Personnel;
  private message:string;
  private replaceableEmail:string;
  private replacementEmail?:string

  constructor(personnel:Personnel) {
    this.personnel = personnel;
  }

  /**
   * Change the name or description of the entity
   * @param now 
   */
  public correctEntity = async (now:Entity) => {
    if( ! now.entity_id) {
      throw new Error(`Invalid/missing parameter(s): Missing entity_id`);
    }
    const crud = EntityCrud(now as Entity);
    const then = await crud.read() as Entity;
    if(now.entity_name != then.entity_name || now.description != then.description) {
      await crud.update();
      return;
    }
    console.warn(`EntityToCorrect.correctEntity: No change to entity`);
  }

  /**
   * Replace an entity representative with someone who is either being immediately invited to be the replacement,
   * or simply remove the person being replaced with the replacement to be invited later.
   * @param replaceableEmail The email of the entity representative who is being replaced
   * @param replacementEmail The email of someone to be invited as a replacement entity representative
   * @returns 
   */
  public correctPersonnel = async (replaceableEmail:string, replacementEmail?:string):Promise<boolean> => {
    let { correctEntityUsers, personnel } = this;

    this.replaceableEmail = replaceableEmail;
    this.replacementEmail = replacementEmail;

    if( ! await correctEntityUsers()) return false;

    await scheduleStaleEntityVacancyHandler(personnel.getEntity(), personnel.getReplaceableUser()!.role);

    return true;
  }

  /**
   * Configure the personnel class for the upcoming entity user correction.
   * @returns 
   */
  private correctEntityUsers = async ():Promise<boolean> => {
    let { personnel, replaceableEmail, replacementEmail } = this;
    if(replacementEmail && replaceableEmail == personnel.getReplacerEmail()) {
      personnel = personnel.forRemovalOf().myself().andReplacementWith(replacementEmail);
      this.message = `An entity representative cannot name a successor if they are removing themselves`;
      return false;
    }
    else if(replacementEmail && replacementEmail == replaceableEmail) {
      this.message = `The emails of the individual being replaced and the invitee to replace them cannot be the same`;
      return false;
    }
    else if( ! replacementEmail && replaceableEmail == personnel.getReplacerEmail()) {
      personnel = personnel.forRemovalOf().myself();
    }
    else if(replacementEmail && replaceableEmail != personnel.getReplacerEmail()) {
      personnel = personnel.forRemovalOf(replaceableEmail).andReplacementWith(replacementEmail);
    }
    else if( ! replacementEmail && replaceableEmail != personnel.getReplacerEmail()) {
      personnel = personnel.forRemovalOf(replaceableEmail);
    }

    // "Pull the trigger" on the corresponding user deactivation, cognito deletion, and optional invitation.
    personnel = await personnel.execute();

    return true;
  }

  public getMessage = () => this.message;
}

/**
 * Schedule a delayed execution that terminates the entity if the replacement does not arrive in time.
 */
export const scheduleStaleEntityVacancyHandler = async (entity:Entity, role:Role) => {
  const envVarName = DelayedExecutions.HandleStaleEntityVacancy.targetArnEnvVarName;
  const functionArn = process.env[envVarName];
  if(functionArn) {
    const configs = new Configurations();
    const { STALE_AI_VACANCY, STALE_ASP_VACANCY } = ConfigNames;
    const { entity_id, entity_name } = entity ?? {};
    const lambdaInput = { entity_id } as StaleVacancyLambdaParms;
    const delayedTestExecution = new DelayedLambdaExecution(functionArn, lambdaInput);
    const staleAfter = role == Roles.RE_ADMIN ? STALE_ASP_VACANCY : STALE_AI_VACANCY;
    let waitTime = (await configs.getAppConfig(staleAfter)).getDuration();
    waitTime += 60; // Event bridge seems to trigger early at times by anywhere up to 18 seconds, so tack on an extra minute.
    const timer = EggTimer.getInstanceSetFor(waitTime, PeriodType.SECONDS);
    await delayedTestExecution.startCountdown(timer, `Stale entity vacancy handler: ${entity_name}`);
  }
  else {
    console.error(`Cannot schedule stale entity vacancy handler: ${envVarName} variable is missing from the environment!`);
  }    
}



/**
 * RUN MANUALLY
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/authorized-individual/correction/EntityCorrection.ts')) {

  const { HandleStaleEntityVacancy } = DelayedExecutions;
  const correctable = 'user' as 'entity' | 'user';

  (async () => {
    const context:IContext = await require('../../../../../contexts/context.json');
    const { STACK_ID, ACCOUNT, REGION, TAGS: { Landscape }} = context;

    const entity_id = '69d2fd15-e55b-4054-88d7-a5a59744356b';
    let corrector:EntityToCorrect;
    switch(correctable) {
      case "entity":
        const correctedEntityName = `The School of Hard Knocks ${new Date().toISOString()}`;
        corrector = new EntityToCorrect(new Personnel({ entity:entity_id }));
        await corrector.correctEntity({ entity_id, entity_name:correctedEntityName } as Entity);
        break;
      case "user":    
        // Get cloudfront domain
        const cloudfrontDomain = await lookupCloudfrontDomain(Landscape);
    
        // Get userpool ID
        const prefix = `${STACK_ID}-${Landscape}`;
        const userpoolId = await lookupUserPoolId(`${prefix}-cognito-userpool`, REGION);

        // Get the arn of the applicable delayed execution lambda function
        const staleFuncName = `${prefix}-${HandleStaleEntityVacancy.coreName}`;

        // Set environment variables
        process.env[HandleStaleEntityVacancy.targetArnEnvVarName] = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${staleFuncName}`;
        process.env.CLOUDFRONT_DOMAIN = cloudfrontDomain;
        process.env.USERPOOL_ID = userpoolId;
        process.env.REGION = REGION;
        process.env.PREFIX = prefix;

        // Set parameters
        const replacerEmail = 'auth2.random.edu@warhen.work';
        const replaceableEmail = 'auth1.random.edu@warhen.work';
        let replacementEmail:string|undefined;
        replacementEmail = 'auth3.random.edu@warhen.work';

        // Perform the correction
        corrector = new EntityToCorrect(new Personnel({ entity:entity_id, replacer:replacerEmail }));
        const corrected = await corrector.correctPersonnel(replaceableEmail, replacementEmail);
        console.log(corrected ? 'Succeeded' : 'Failed');
        break;
    }
  })();
}