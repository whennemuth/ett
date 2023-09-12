
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'

const dbclient = new DynamoDBClient({ region: process.env.AWS_REGION });

export const handler = async(event) => {

  console.log('------------------ EVENT ------------------')
  console.log(JSON.stringify(event, null, 2));
  console.log('-------------------------------------------')

  // RESUME NEXT: Write some code to switch on a "task" querystring item and create registered entity 
  // and invite users with the corresponding dynamodb entries. Come up with an initial data model. for user.

}