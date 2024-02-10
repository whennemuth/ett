import { DynamoDbConstruct } from "../../../DynamoDb";
import { handler as postSignupHandler } from "./PostSignup";
import { handler as preSignupHandler} from './PreSignup';
import { handler as preAuthHandler} from './PreAuthentication'

const event = {
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
          "email": "wrh@bu.edu",
          "phone_number": "+6175558888"
      }
  },
  "response": {},
  "validationData": {}
};

/**
 * Run one of the cognito triggered lambda functions locally.
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
        "postsignup"
      ], 
      "env": {
        "AWS_PROFILE": "bu",
        "REGION": "us-east-2"
      }, 
    },
 */
switch(process.argv[2].toLocaleLowerCase()) {

  case 'presignup':
    // RESUME NEXT 5: Run this and see that it properly accepts an invited user. Try different scenarios, 
    // including multiple pending invitations to the same entity for the same role and email
    new Promise<void>((resolve, reject) => {
      try {
        process.env.DYNAMODB_INVITATION_TABLE_NAME = DynamoDbConstruct.DYNAMODB_TABLES_INVITATION_TABLE_NAME;
        event.triggerSource = 'PreSignUp_SignUp';
        preSignupHandler(event);
        resolve();
      }
      catch(e) {
        reject(e);
      }
    });
    break;

  case 'postsignup':
    // RESUME NEXT 6: Run this and confirm expected results.
    new Promise<void>((resolve, reject) => {
      try {
        process.env.DYNAMODB_USER_TABLE_NAME = DynamoDbConstruct.DYNAMODB_TABLES_USERS_TABLE_NAME;
        event.triggerSource = 'PostConfirmation_ConfirmSignUp';
        postSignupHandler(event);
        resolve();
      }
      catch (e) {
        reject(e);
      }
    });
    break;

  case 'preauthentication':    
    new Promise<void>((resolve, reject) => {
      try {
        process.env.DYNAMODB_INVITATION_TABLE_NAME = DynamoDbConstruct.DYNAMODB_TABLES_INVITATION_TABLE_NAME;
        event.triggerSource = 'PreAuthentication_Authentication';
        preAuthHandler(event);
        resolve();
      }
      catch (e) {
        reject(e);
      }
    });
    break;
}

