import { CreateScheduleCommand, CreateScheduleCommandInput, DeleteScheduleCommand, DeleteScheduleCommandInput, SchedulerClient, ScheduleState, Target } from "@aws-sdk/client-scheduler";
import { v4 as uuidv4 } from 'uuid';
import { IContext } from "../../../../contexts/IContext";
import * as ctx from '../../../../contexts/context.json';
import { log } from "../../Utils";
import { EggTimer, PeriodType } from "./EggTimer";


export interface DelayedExecution {
  startCountdown(timer:EggTimer, Name:string, Description?:string):Promise<void>
}

/**
 * An interface for the input a lambda function must expect if it is triggered by an
 * event bridge schedule created through the DelayedLambdaExecution class.
 */
export interface ScheduledLambdaInput {
  /** Parameters for the task the lambda function must perform */
  lambdaInput:any,
  /**
   * The lambda function must also be provided the name of the one-time event bridge schedule that invoked it
   * in order to delete it as a final secondary cleanup task (include the groupName).
   */
  scheduleName:string,
  groupName:string
}

/**
 * Represents the execution of a specified lambda function set to occur when a provided "egg timer" goes off.
 */
export class DelayedLambdaExecution implements DelayedExecution {
  private lambdaArn:string;
  private lambdaInput:any;

  // private scheduledLambdaInput:ScheduledLambdaInput;
  private uuid:string;

  constructor(lambdaArn:string, lambdaInput:any) {
    this.lambdaArn = lambdaArn;
    this.lambdaInput = lambdaInput;
    this.uuid = uuidv4();
    // this.scheduledLambdaInput = scheduledLambdaInput;
  }

  public startCountdown = async (timer:EggTimer, Name:string, Description?:string):Promise<any> => {
    return timer.startTimer(async () => {
      const { lambdaArn, lambdaInput, uuid } = this;
      const context:IContext = <IContext>ctx;
      const { ACCOUNT, REGION:region } = context;
      const scheduleName = `${getPrefix()}-${Name}-${uuid}` // 64 character limit;
      Description = Description || `${getPrefix()}-${Name}`;

      if(timer.getMilliseconds() == 0) {
        console.log(`${Description} NOT SCHEDULED (the corresponding cron has been deactivated)`);
        return;
      }

      // Create the event bridge schedule
      const schedulerClient = new SchedulerClient({ region });
      const createScheduleCommand = new CreateScheduleCommand({
        Name: scheduleName,
        GroupName: getGroupName(),
        ScheduleExpression: timer.getCronExpression(),
        State: ScheduleState.ENABLED,
        Description,
        Target: {
          Arn: lambdaArn,
          RoleArn: `arn:aws:iam::${ACCOUNT}:role/${getPrefix()}-scheduler-role`,
          Input: JSON.stringify({ lambdaInput, scheduleName, groupName:getGroupName() } as ScheduledLambdaInput),
        } as Target,
        FlexibleTimeWindow: { Mode: "OFF" },
      } as CreateScheduleCommandInput);
      const response = await schedulerClient.send(createScheduleCommand);

      // Log the result
      const { ScheduleArn } = response;
      log({ 
        scheduleName, 
        ScheduleArn, 
        scheduleExpression: timer.getCronExpression(),
        lambdaArn,
        lambdaInput,
        groupName:getGroupName(),
      }, `Created event bridge schedule`);
    })
  }
}

export const getPrefix = ():string => {
  let prefix = process.env.PREFIX;
  if( ! prefix) {
    const context:IContext = <IContext>ctx;
    const { STACK_ID, TAGS: { Landscape } } = context;
    prefix = `${STACK_ID}-${Landscape}`;
  }
  return prefix;
}

export const getGroupName = (prefix?:string):string => {
  return `${prefix || getPrefix()}-scheduler-group`;
}

/**
 * Provide a function to delete the one-time event bridge schedule that triggers the lambda 
 * @returns 
 */
export const PostExecution = () => {
  const cleanup = async (scheduleName:string, groupName:string) => {
    try {
      const { REGION:region } = process.env;
      const client = new SchedulerClient({ region });

      if( ! scheduleName) {
        log({ scheduleName }, 'Cannot delete schedule, missing scheduleName');
        return;
      }

      // 2) Delete the schedule
      const commandInput = { Name: scheduleName, GroupName: groupName } as DeleteScheduleCommandInput;
      log(commandInput, `Deleting event bridge schedule`);
      try {
        await client.send(new DeleteScheduleCommand(commandInput));
      }
      catch(e) {
        if((e as Error).name == 'ResourceNotFoundException') {
          log(e, `Event bridge schedule ${scheduleName} in group ${groupName} not found`);
        }
        else {
          log(e, `Failed to delete event bridge schedule ${scheduleName} in group ${groupName}`);
        }
      }
    }
    catch(e) {
      log(e, `Failed to delete ${scheduleName} from group ${groupName}`);
    }
  }
  return { cleanup };
}




/**
 * RUN MANUALLY: 
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/timer/DelayedExecution.ts')) {

  const task = 'lambda' as 'test'|'lambda';
  const { SECONDS, MINUTES } = PeriodType;
  switch(task) {

    case 'test':
      // Egg timer started in a way to make it synchronous such that the instantiating code will wait for it to elapse. 
      const howManySeconds = 5;
      const timer = EggTimer.getInstanceSetFor(howManySeconds, SECONDS);
      (async () => {
        const delayedTestExecution = new class implements DelayedExecution {
          startCountdown(timer:EggTimer, Name:string, Description?:string): Promise<any> {
            return new Promise(resolve => setTimeout(resolve, timer.getMilliseconds()));
          }
        }();

        console.log(`Start waiting for ${howManySeconds} seconds...`);
        await delayedTestExecution.startCountdown(timer, 'testing-one-two-three', 'Testing one two three');    
        console.log(`${howManySeconds} seconds have passed!`);
      })();
      break;

    case 'lambda':
      // Start an egg timer that "delegates" the countdown to some other entity - in this case, event bridge.
      // Thus the egg timer returns immediately and the real egg timer is an event bridge schedule.
      (async () => {
        const context:IContext = await require('../../../../contexts/context.json');
        const { REGION, STACK_ID, TAGS: { Landscape }, ACCOUNT } = context;
        const prefix = `${STACK_ID}-${Landscape}`;
        process.env.REGION = REGION;
        process.env.PREFIX = prefix;

        // Define the name of the event bridge schedule that will get created by the delayed execution instance.
        const scheduleName = `${prefix}-TestSchedule-${Date.now()}`;

        // Set the arn of an existing lambda function that "expects" the ScheduledLambdaInput type for its event object.
        // This lambda should also perform cleanup by deleting the event bridge schedule.
        const lambdaArn = `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${prefix}-handle-stale-entity-vacancy`;

        // Create a delayed execution instance set to target an existing lambda
        const delayedTestExecution = new DelayedLambdaExecution(lambdaArn, {} as ScheduledLambdaInput);
        const timer = EggTimer.getInstanceSetFor(2, MINUTES); 
        await delayedTestExecution.startCountdown(timer, 'testing-one-two-three', 'Testing one two three');
        // If the lambda is one that sends you an email after the timeout, check your inbox.
      })();
      break;
  }

}
