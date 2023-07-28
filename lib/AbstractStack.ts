import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IContext } from '../contexts/IContext';

export class AbstractStack extends Stack {

  constructor(scope:Construct, constructId:string, stackProps:StackProps) {

    super(scope, constructId, stackProps);

    const context:IContext = scope.node.getContext('stack-parms');

    // Set the tags for the stack
    var tags: object = context.TAGS;
    for (const [key, value] of Object.entries(tags)) {
      this.tags.setTag(key, value);
    }
  }
}