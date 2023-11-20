import { DynamoDbConstruct } from "../../../DynamoDb";
import { handler } from "./PostSignup";

/**
 * Run the post signup lambda function locally.
 * Change the event fields with values appropriate to your use case.
 * Example launch configuration:
 * 
 *  {
      "type": "node",
      "request": "launch",
      "name": "Cognito post signup handler",
      "skipFiles": [ "<node_internals>/**" ],
      "runtimeArgs": ["-r", "${workspaceFolder}/node_modules/ts-node/register/transpile-only"],
      "args": [
        "${workspaceFolder}/lib/lambda/functions/cognito/runner.ts",
      ], 
      "env": {
        "AWS_PROFILE": "bu",
        "REGION": "us-east-2"
      }, 
    },
 */
new Promise<void>((resolve, reject) => {
  try {
    process.env.DYNAMODB_USER_TABLE_NAME = DynamoDbConstruct.DYNAMODB_TABLES_USERS_TABLE_NAME;
    handler({
      "version": "1",
      "region": "us-east-2",
      "userPoolId": "us-east-2_pAHqeZF0m",
      "userName": "d457e422-bb5f-41f1-aa7d-a9307885c0c7",
      "callerContext": {
          "awsSdkVersion": "aws-sdk-unknown-unknown",
          "clientId": "6h8mumjhpmd5pc0fne2bnhu061"
      },
      "triggerSource": "PostConfirmation_ConfirmSignUp",
      "request": {
          "userAttributes": {
              "sub": "d457e422-bb5f-41f1-aa7d-a9307885c0c7",
              "email_verified": "true",
              "cognito:user_status": "CONFIRMED",
              "cognito:email_alias": "wrh@bu.edu",
              "name": "Warren Hennemuth",
              "email": "wrh@bu.edu"
          }
      },
      "response": {}
    });
    resolve();
  }
  catch (e) {
    reject(e);
  }
})
