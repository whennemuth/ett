import { EventBridgeClient, PutRuleCommand, PutRuleCommandOutput, PutTargetsCommand } from "@aws-sdk/client-eventbridge";
import { AbstractEventBus, AbstractEventBusRule } from "./Abstract";
import { IContext } from "../../../../../contexts/IContext";
import * as ctx from '../../../../../contexts/context.json';
import { v4 as uuidv4 } from 'uuid';
import { AddPermissionCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { ScheduledLambdaInput } from "../DelayedExecution";

export type RuleParms = {
  Description:string,
  ScheduleExpression:string,
  lambdaArn:string,
  lambdaInput:any,
  putInvokePrivileges:boolean
}
export class Rule extends AbstractEventBusRule {
  private parms:RuleParms;

  constructor(parms:RuleParms) {
    super();
    this.parms = parms;
  }

  public create = async (eventBus:AbstractEventBus): Promise<AbstractEventBusRule> => {
    const { getName, parms: {
      Description, ScheduleExpression, lambdaArn, lambdaInput, putInvokePrivileges
    }} = this;
    let { REGION: region } = process.env
    const { REGION } = ctx as IContext;
    region = region ?? REGION;
    const targetId = `${getName()}-targetId`;
    
    // 1) Create the event bridge rule
    const eventBridgeClient = new EventBridgeClient({ region });
    const response = await eventBridgeClient.send(new PutRuleCommand({
      Name: getName(),
      EventBusName: eventBus.getName(),
      Description,
      ScheduleExpression,
      State: "ENABLED",
    })) as PutRuleCommandOutput;
    const { RuleArn } = response;

    // 2) Put a lambda target to the event bridge rule
    const lambdaClient = new LambdaClient({ region });
    const putTargetsCommand = new PutTargetsCommand({
      Rule: getName(),
      Targets: [{ 
        Id: targetId, 
        Arn: lambdaArn,
        Input: JSON.stringify({
          lambdaInput,
          eventBridgeRuleName: getName(),
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

    return this;
  }

  public getName = ():string => {
    if( ! this.ruleName) {
      this.ruleName = `${this.parentBus.getName()}-rule-${uuidv4()}`
    }
    return this.ruleName;
  }
}