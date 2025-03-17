import * as ctx from '../../../../../contexts/context.json';
import { IContext } from "../../../../../contexts/IContext";
import { DelayedExecutions } from "../../../../DelayedExecution";
import { lookupUserPoolId } from "../../../_lib/cognito/Lookup";
import { Configurations } from "../../../_lib/config/Config";
import { EntityCrud } from "../../../_lib/dao/dao-entity";
import { UserCrud } from '../../../_lib/dao/dao-user';
import { ConfigNames, Entity, Role, Roles, User } from "../../../_lib/dao/entity";
import { EmailParms, sendEmail } from '../../../_lib/EmailWithAttachments';
import { DelayedLambdaExecution } from "../../../_lib/timer/DelayedExecution";
import { EggTimer, PeriodType } from "../../../_lib/timer/EggTimer";
import { log, lookupCloudfrontDomain } from "../../../Utils";
import { RulePrefix, StaleVacancyLambdaParms } from "../../delayed-execution/targets/HandleStaleEntityVacancy";
import { Personnel } from "./EntityPersonnel";

export type CorrectEntityParms = {
  now:Entity;
  correctorSub:string;
}

export type CorrectPersonnelParms = {
  replaceableEmail:string;
  replacementEmail?:string;
};

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
  public correctEntity = async (parms:CorrectEntityParms) => {
    log(parms, 'EntityToCorrect.correctEntity');
    const { now, correctorSub } = parms;
    if( ! now.entity_id) {
      throw new Error(`Invalid/missing parameter(s): Missing entity_id`);
    }

    // Obtain the entity as it currently exists BEFORE making any changes - "then"
    const entityCrud = EntityCrud(now as Entity);
    const then = await entityCrud.read() as Entity;
    if(now.entity_name == then.entity_name && now.description == then.description) {
      console.warn(`EntityToCorrect.correctEntity: No change to entity`);
      return;
    }

    // Apply the changes to the entity
    await entityCrud.update();

    // Obtain all users of the entity
    const entityUsers = await UserCrud({ entity_id:now.entity_id } as User).read() as User[];

    // Obtain the user who is making the correction
    const correctingUser = entityUsers.find(user => user.sub == correctorSub) ?? { 
      email:'unknown', fullname:'unknown' 
    } as User;

    // Obtain all users of the entity who are NOT making the correction
    const otherUsers = entityUsers.filter(user => user.sub != correctorSub);

    // Send an email to all users of the entity about the change, except the user who is making the correction.
    const context:IContext = <IContext>ctx;
    const { email, fullname } = correctingUser;
    for(const user of otherUsers) {
      log({
        corrector: { email, fullname },
        entities: { then, now },
      }, `Sending entity correction email to: ${user.email} about change of entity name`);
      sendEmail({
        subject: `ETT Entity Correction Notification`,
        from: `noreply@${context.ETT_DOMAIN}`,
        message: `This email is notification of change with regards to your registration in the Ethical ` +
          `Training Tool (ETT): ${fullname} has changed the name of "${then.entity_name}" to "${now.entity_name}".`,
        to: [ user.email ]
      } as EmailParms);
    }
  }

  /**
   * Replace an entity representative with someone who is either being immediately invited to be the replacement,
   * or simply remove the person being replaced with the replacement to be invited later.
   * @param replaceableEmail The email of the entity representative who is being replaced
   * @param replacementEmail The email of someone to be invited as a replacement entity representative
   * @returns 
   */
  public correctPersonnel = async (parms:CorrectPersonnelParms):Promise<boolean> => {
    const { replaceableEmail, replacementEmail } = parms;
    let { correctEntityUsers, personnel } = this;

    this.replaceableEmail = replaceableEmail;
    this.replacementEmail = replacementEmail;
    const { getEntity, getReplaceableUser, getReplacerEmail } = personnel;

    if( ! await correctEntityUsers()) return false;

    await scheduleStaleEntityVacancyHandler(getEntity(), getReplaceableUser()!.role);

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
    await delayedTestExecution.startCountdown(timer, `${RulePrefix}: ${entity_name}`);
  }
  else {
    console.error(`Cannot schedule ${RulePrefix}: ${envVarName} variable is missing from the environment!`);
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
        await corrector.correctEntity({
          now: { entity_id, entity_name:correctedEntityName } as Entity,
          correctorSub: '216bc5e0-30a1-7065-1b6c-1c01467a315d'
        });
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
        const registrationUri = `https://${cloudfrontDomain}/bootstrap/index.htm`;
        corrector = new EntityToCorrect(new Personnel({ entity:entity_id, replacer:replacerEmail, registrationUri }));
        const corrected = await corrector.correctPersonnel({ replaceableEmail, replacementEmail });
        console.log(corrected ? 'Succeeded' : 'Failed');
        break;
    }
  })();
}