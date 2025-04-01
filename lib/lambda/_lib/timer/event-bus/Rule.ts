import { EventBridgeClient, PutRuleCommand, PutRuleCommandOutput, PutTargetsCommand, Rule } from "@aws-sdk/client-eventbridge";
import { AddPermissionCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { v4 as uuidv4 } from 'uuid';
import { IContext } from "../../../../../contexts/IContext";
import * as ctx from '../../../../../contexts/context.json';
import { log } from "../../../Utils";
import { ScheduledLambdaInput } from "../DelayedExecution";
import { AbstractEventBus, AbstractEventBusRule } from "./Abstract";
import { deleteRuleAndTarget, lookupTarget } from "./Utils";

export type EttRuleData = Rule & {
  lambdaArn?:string,
  lambdaInput?:any
}
export class EttRule extends AbstractEventBusRule {
  private data:EttRuleData;
  private region:string;

  public constructor(data:EttRuleData) {
    super();
    this.data = data;
    let { REGION: region } = process.env
    const { REGION } = ctx as IContext;
    this.region = region ?? REGION;
  }

  public getData = async ():Promise<EttRuleData> => {
    const { data, data: { Name, lambdaArn, lambdaInput }, region } = this;
    if(lambdaArn && lambdaInput) return data;
    const target = await lookupTarget(Name!, region);
    if(target) {
      data.lambdaArn = target.Arn;
      data.lambdaInput = JSON.parse(target.Input!).lambdaInput;
    }
    return data;
  }

  public getLambdaArn = async ():Promise<string> =>  (await this.getData()).lambdaArn!;

  public getLambdaInput = async ():Promise<any> =>  (await this.getData()).lambdaInput;

  public create = async (eventBus:AbstractEventBus, putInvokePrivileges:boolean): Promise<void> => {
    const { getName, region, data: {
      Description, ScheduleExpression, lambdaArn, lambdaInput
    }} = this;
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
    this.data.Arn = RuleArn;
    this.data.Name = getName();

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

  }

  public Delete = async ():Promise<void> => {
    const { region, data: { Name } } = this;
    if( ! Name) {
      log(`Cannot delete rule, missing Name`);
      return;
    }
    await deleteRuleAndTarget(Name!, `${Name}-targetId`, region);
  }

  public getName = ():string => {
    this.ruleName = this.ruleName ?? this.data.Name;
    this.ruleName = this.ruleName ?? `${this.parentBus.getName()}-rule-${uuidv4()}`;
    return this.ruleName;
  }
}