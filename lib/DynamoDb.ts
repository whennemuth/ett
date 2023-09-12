import { RemovalPolicy } from "aws-cdk-lib";
import { AttributeType, Billing, TableV2, TableClass } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { IContext } from "../contexts/IContext";

export class DynamoDbConstruct extends Construct {
  
  context: IContext;
  
  constructor(scope: Construct, constructId: string, props:any) {

    super(scope, constructId);

    this.context = scope.node.getContext('stack-parms');

    const entityTable = new TableV2(this, 'DbUsers', {
      tableName: 'Users',
      partitionKey: { name: 'CognitoUserEmail', type: AttributeType.STRING },
      sortKey: { name: 'EntityName', type: AttributeType.STRING },
      billing: Billing.onDemand(),
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      removalPolicy: RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
      deletionProtection: this.context.TAGS.Landscape == 'prod',      
    });


  }
}