import { DeleteRuleCommand, DeleteRuleRequest, EventBridgeClient, PutRuleCommand, PutRuleCommandOutput, PutTargetsCommand, RemoveTargetsCommand, RemoveTargetsCommandInput, RemoveTargetsResponse } from "@aws-sdk/client-eventbridge";
import { AddPermissionCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { EggTimer, PeriodType } from "./EggTimer";
import { v4 as uuidv4 } from 'uuid';
import { log } from "../../Utils";

export interface DelayedExecution {
  startCountdown(timer:EggTimer, Description?:string):Promise<void>
}

/**
 * An interface for the input a lambda function must expect if it is triggered by an
 * event bridge rule created through the DelayedLambdaExecution class.
 */
export interface ScheduledLambdaInput {
  /** Parameters for the task the lambda function must perform */
  lambdaInput:any,
  /**
   * The lambda function must also be provided the name of the one-time event bridge rule that invoked it
   * in order to delete it as a final secondary cleanup task.
   */
  eventBridgeRuleName:string,
  /** 
   * The lambda function must also be provided the ID of the target event bridge identifies the lambda
   * function by. This is needed to remove the target from the event bridge rule as a prerequisite to deleting it.
   */
  targetId:string
}

/**
 * Represents the execution of a specified lambda function set to occur when a provided "egg timer" goes off.
 */
export class DelayedLambdaExecution implements DelayedExecution {
  private lambdaArn:string;
  private lambdaInput:any;
  private putInvokePrivileges:boolean;

  // private scheduledLambdaInput:ScheduledLambdaInput;
  private uuid:string;

  constructor(lambdaArn:string, lambdaInput:any, putInvokePrivileges:boolean=false) {
    this.lambdaArn = lambdaArn;
    this.lambdaInput = lambdaInput;
    this.putInvokePrivileges = putInvokePrivileges;
    this.uuid = uuidv4();
    // this.scheduledLambdaInput = scheduledLambdaInput;
  }

  public startCountdown = async (timer:EggTimer, Description:string='Event bridge rule'):Promise<any> => {
    return timer.startTimer(async () => {
      const { lambdaArn, lambdaInput, putInvokePrivileges, uuid } = this;
      const { REGION:region, PREFIX } = process.env
      const eventBridgeRuleName = `${PREFIX}-${uuid}`
      const targetId = `${eventBridgeRuleName}-targetId`; 

      if(timer.getMilliseconds() == 0) {
        console.log(`${Description} NOT SCHEDULED (the corresponding cron has been deactivated)`);
        return;
      }

      // 1) Create the event bridge rule
      const eventBridgeClient = new EventBridgeClient({ region });
      const response = await eventBridgeClient.send(new PutRuleCommand({
        Name: eventBridgeRuleName,
        Description,
        ScheduleExpression: timer.getCronExpression(),
        State: "ENABLED",
      })) as PutRuleCommandOutput;
      const { RuleArn } = response;

      // 2) Put a lambda target to the event bridge rule
      const lambdaClient = new LambdaClient({ region });
      const putTargetsCommand = new PutTargetsCommand({
        Rule: eventBridgeRuleName,
        Targets: [{ 
          Id: targetId, 
          Arn: lambdaArn,
          Input: JSON.stringify({
            lambdaInput,
            eventBridgeRuleName,
            targetId
          } as ScheduledLambdaInput)
        }],
      });
      await eventBridgeClient.send(putTargetsCommand);

      /** 
       * 3) Add a permission to the lambda for the event bridge rule to invoke it
       * NOTE: Set putInvokePrivileges to true only if the target lambda does not already grant invoke  
       * privileges to the events service principal through a role or inline policy statement
       */
      if(putInvokePrivileges) {
        const addPermissionCommand = new AddPermissionCommand({
          FunctionName: lambdaArn,
          StatementId: `allow-eventbridge-invoke-${Date.now()}`,
          Action: "lambda:InvokeFunction",
          Principal: "events.amazonaws.com",
          SourceArn: RuleArn,
        });
        await lambdaClient.send(addPermissionCommand);
      }

      console.log(`${Description} scheduled: ${timer.getCronExpression()}`);
    })
  }
}

/**
 * Provide a function to delete the one-time event bridge rule that triggers the lambda 
 * @returns 
 */
export const PostExecution = () => {
  const cleanup = async (eventBridgeRuleName:string, targetId:string) => {
    try {
      const { REGION:region } = process.env;
      const client = new EventBridgeClient({ region });

      if( ! targetId ) {
        log({ eventBridgeRuleName, targetId }, `ERROR: Cannot delete rule, missing targetId`);
        return;
      }

      if( ! eventBridgeRuleName) {
        log({ eventBridgeRuleName, targetId }, 'Cannot delete rule, missing eventBridgeRuleName');
        return;
      }

      // 1) Remove the lambda target from the rule
      const removeRequest = {
        Rule: eventBridgeRuleName,
        Ids: [ targetId ],        
      } as RemoveTargetsCommandInput;
      log(removeRequest, 'Removing lambda target from event bridge rule');
      const removeResponse:RemoveTargetsResponse = await client.send(new RemoveTargetsCommand(removeRequest));
      if((removeResponse.FailedEntries ?? []).length > 0) {
        log(removeResponse, `ERROR: Failed to remove lambda target from event bridge rule`)
      }

      // 2) Delete the rule
      const deleteRequest = {
        Name:eventBridgeRuleName,
        Force:true
      } as DeleteRuleRequest;
      log(deleteRequest, `Deleting event bridge rule`);
      await client.send(new DeleteRuleCommand(deleteRequest));
    }
    catch(e) {
      log(e, `ERROR: Failed to delete ${eventBridgeRuleName}`);
    }
  }
  return { cleanup };
}


/**
 * RUN MANUALLY: 
 */
const { argv:args } = process;
if(args.length > 3 && args[2] == 'RUN_MANUALLY_DELAYED_EXECUTION') {

  const task = args[3];
  const { SECONDS, MINUTES } = PeriodType;
  switch(task) {

    case 'test':
      // Egg timer started in a way to make it synchronous such that the instantiating code will wait for it to elapse. 
      const howManySeconds = 5;
      const timer = EggTimer.getInstanceSetFor(howManySeconds, SECONDS);
      (async () => {
        const delayedTestExecution = new class implements DelayedExecution {
          startCountdown(timer:EggTimer, Description?:string): Promise<any> {
            return new Promise(resolve => setTimeout(resolve, timer.getMilliseconds()));
          }
        }();

        console.log(`Start waiting for ${howManySeconds} seconds...`);
        await delayedTestExecution.startCountdown(timer, 'Testing 123...');    
        console.log(`${howManySeconds} seconds have passed!`);
      })();
      break;

    case 'lambda':
      // Start an egg timer that "delegates" the countdown to some other entity - in this case, event bridge.
      // Thus the egg timer returns immediately and the real egg timer is an event bridge rule.
      (async () => {
        // Define the name of the event bridge rule that will get created by the delayed execution instance.
        const eventBridgeRuleName = `ett-dev-TestRule-${Date.now()}`;

        // Set the arn of an existing lambda function that "expects" the ScheduledLambdaInput type for its event object.
        // This lambda should also perform cleanup by deleting the event bridge rule.
        const lambdaArn = 'Set something here';

        // Create a delayed execution instance set to target an existing lambda
        const delayedTestExecution = new DelayedLambdaExecution(lambdaArn, {
          lambdaParms: {},
          eventBridgeRuleName,
          targetId: `${eventBridgeRuleName}-targetId`
        });
        const timer = EggTimer.getInstanceSetFor(2, MINUTES); 
        await delayedTestExecution.startCountdown(timer, 'Testing 123...');
        // If the lambda is one that sends you an email after the timeout, check your inbox.
      })();
      break;
  }

}
