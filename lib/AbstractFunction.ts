import { RemovalPolicy } from 'aws-cdk-lib';
import { Function, FunctionProps } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { IContext } from '../contexts/IContext';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { LogGroup } from 'aws-cdk-lib/aws-logs';

export interface AbstractFunctionProps extends FunctionProps {
  cleanup?: boolean
};

/**
 * Abstract class for lambda functions to extend so as to acquire some boilerplate functionality, among
 * which is the automatic cleanup of function logs when the stack the lambda function belongs to is deleted.
 */
export class AbstractFunction extends Function {
  constructId: string;
  context: IContext;
  scope: Construct;

  constructor(scope:Construct, constructId:string, props:AbstractFunctionProps) {
    super(scope, constructId, props);
    this.context = scope.node.getContext('stack-parms');
    this.constructId = constructId;
    this.scope = scope;
    
    if(props.cleanup) {
      // The log group gets created as a resource by the cdk, and so gets deleted along with the stack.
      const log_group = new LogGroup(scope, 'LogGroup', {
        logGroupName: `/aws/lambda/${props.functionName}`,
        removalPolicy: RemovalPolicy.DESTROY,
      });
      log_group.grantWrite(this);
    }
    else {
      // The logs are created automatically by the lambda function, and will be orphaned if the stack is deleted.
      this.addToRolePolicy(new PolicyStatement({        
        actions: ['logs:CreateLogStream', 'logs:CreateLogGroup', 'logs:PutLogEvents'],
        resources: ['*'],
      }));
    }
  };
}

