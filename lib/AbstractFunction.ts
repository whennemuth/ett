import { RemovalPolicy } from 'aws-cdk-lib';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { IContext } from '../contexts/IContext';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { LogGroup } from 'aws-cdk-lib/aws-logs';

/**
 * Abstract class for lambd functions to extend so as to acquire some boilerplate functionality, among
 * which is the automatic cleanup of function logs when the stack the lambda function belongs to is deleted.
 */
export class AbstractFunction extends Function {

  constructId: string;
  context: IContext;

  constructor(scope: Construct, constructId: string, props: any) {

    super(scope, constructId, props);

    this.context = scope.node.getContext('stack-parms');
    this.constructId = constructId;

    if(props?.cleanup) {
      // The log group gets created as a resource by the cdk, and so gets deleted along with the stack.
      new LogGroup(this, `${constructId}-log-group`, {
        logGroupName: `/aws/lambda/${this.functionName}`,
        removalPolicy: RemovalPolicy.DESTROY,
      });
    }
    else {
      // The lambda function will create its own log group. This will hang around after stack deletion.
      this.addToRolePolicy(new PolicyStatement({
        actions: ['logs:CreateLogStream', 'logs:CreateLogGroup', 'logs:PutLogEvents'],
        resources: ['*'],
      }));
    }
  };

}