import { Consenter, ConsenterFields, Role, Roles, User, UserFields, YN } from "../../_lib/dao/entity";
import { DAOUser, DAOFactory, DAOConsenter } from '../../_lib/dao/dao';
import { PreAuthenticationEventType } from "./PreAuthenticationEventType";
import { lookupRole } from '../../_lib/cognito/Lookup';
import { DynamoDbConstruct, TableBaseNames } from "../../../DynamoDb";
import { AdminUpdateUserAttributesCommand, AdminUpdateUserAttributesCommandOutput, AdminUpdateUserAttributesRequest, AttributeType, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { isOkStatusCode } from "../../Utils";

export enum Messages {
  ACCOUNT_UNCONFIRMED = 'Your account has not attained confirmation status',
  EMAIL_UNVERIFIED = 'Signup completion for your account is pending email verification',
  ROLE_LOOKUP_FAILURE = 'Cannot determine role',
  EMAIL_LOOKUP_FAILURE = 'Error recovering your email address',
  ACCOUNT_DEACTIVATED = 'Your role in this account has been deactivated',
  UNAUTHORIZED = 'You do not have the role of ',
  SERVER_ERROR = 'Server error during post-signup process at ',
}

const debugLog = (entry:String) => { 
  if(process.env?.DEBUG === 'true') {
    console.log(entry);
  }
};

/**
 * Intercept all login attempts and turn away any that indicate the user is using a userpool client that
 * corresponds to a role they do not have. For example a CONSENTING_PERSON cannot sign in as a SYS_ADMIN.
 * @param event 
 * @returns 
 */
export const handler = async (_event:any) => {
  try {
    debugLog(JSON.stringify(_event, null, 2));

    const event = _event as PreAuthenticationEventType;
    const { userPoolId, userName, region } = event;
    let role:Role|undefined;
    if( event?.callerContext) {
      const { clientId } = event?.callerContext;

      // Determined what role applies for the user who is trying to login, based on the userpool client used.
      role = await lookupRole(userPoolId, clientId, region);

      if( ! role) {
        throw new Error(Messages.ROLE_LOOKUP_FAILURE);
      }

      const { email, email_verified, 'cognito:user_status':status } = event?.request?.userAttributes;

      if(status == 'FORCE_CHANGE_PASSWORD' && role == Roles.CONSENTING_PERSON) {
        /**
         * In this circumstance, an existing consenter is changing their email address, which means that the
         * corresponding database entry is pending and happens AFTER cognito account creation. Also:
         *   1) The cognito account will NOT be in a confirmed status. Thus we do not proceed further and run
         *      into any confirmation validation checks which are non-applicable in this scenario
         *   2) The cognito account will NOT be verified with respect to the email address. The password reset
         *      itself does not seem to be regarded by cognito as a form of email verification, and the 
         *      "email_verified" attribute remains false. This means that future login attempts will run into
         *      the email EMAIL_UNVERIFIED check below with no clear way to redirect the user to the verification
         *      code input screen of the hosted UI. This would be extraneous anyway because a successful
         *      password reset should be enough to act as email verification (a temp password was sent to the)
         *      new email address, which must be entered - this is tantamount to verification). So, the 
         *      "email_verified" attribute must be set to "true" here, and we exit out to avoid the premature
         *      validation checks of the normal pre-authentication scenario.
         */
        console.log(`FORCE_CHANGE_PASSWORD is in progress, restoring email_verified to true.`);
        const cognitoUserAccount = getUpdateableUserAccount(userPoolId, userName, region);
        await cognitoUserAccount.updateAttribute('email_verified', 'true');
        return event;
      }

      if(status != 'CONFIRMED') {
        throw new Error(Messages.ACCOUNT_UNCONFIRMED);
      }

      if((email_verified + '') != 'true') {
        throw new Error(Messages.EMAIL_UNVERIFIED);
      }

      if( ! email) {
        throw new Error(Messages.EMAIL_LOOKUP_FAILURE);
      }

      let matchingPerson:User|Consenter|null = null;
      if(role == Roles.CONSENTING_PERSON) {
        const daoConsenter = DAOFactory.getInstance({ DAOType: 'consenter', Payload: {
          [ConsenterFields.email]: email
        }}) as DAOConsenter;

        matchingPerson = await daoConsenter.read({ convertDates: false }) as Consenter;
      }
      else {
        const daoUser:DAOUser = DAOFactory.getInstance({ DAOType: "user", Payload: {
          [UserFields.email]: email,
          [UserFields.role]: role
        }}) as DAOUser;

        const entries:User[] = await daoUser.read() as User[];
        for(const user of entries) {
          if(user.role == role) {
            matchingPerson = user;
            break;
          }
        }
      }

      if(matchingPerson && matchingPerson.active == YN.No) {
        throw new Error(Messages.ACCOUNT_DEACTIVATED.replace('role', `${role} role`));
      }

      if(matchingPerson) {
        return event;
      } 
    }

    throw new Error(Messages.UNAUTHORIZED + role);
  }
  catch(e) {
    console.error(e);
    throw e;
  }
}

function getUpdateableUserAccount(UserPoolId:string, Username:string, region:string) {

  const updateAttribute = async (name:string, value:string) => {
    return updateAttributes({ [name]: value });
  }

  const updateAttributes = async (updates:Record<string, string>) => {
    const client = new CognitoIdentityProviderClient({ region });
    const UserAttributes = [] as AttributeType[];
    
    for (const Name in updates) {
      const Value = updates[Name];
      UserAttributes.push({ Name, Value });
    }

    const input = { UserPoolId, Username, UserAttributes } as AdminUpdateUserAttributesRequest;
    const command = new AdminUpdateUserAttributesCommand(input);
    const response = await client.send(command) as AdminUpdateUserAttributesCommandOutput;
    if( ! isOkStatusCode(response.$metadata.httpStatusCode)) {
      console.log(`Error updating cognito user account attribute(s): ${JSON.stringify({
        commandInput: input,
        commandOutput: response
      }, null, 2)}`)
    }
  }

  return {
    updateAttribute, updateAttributes
  }
} 


/**
 * RUN MANUALLY
 */
const { argv:args } = process;
if(args.length > 2 && args[2] == 'RUN_MANUALLY_PRE_AUTHENTICATION') {

  process.env.APP_CONFIGS = "{\"useDatabase\":true,\"configs\":[{\"name\":\"auth-ind-nbr\",\"value\":\"2\",\"config_type\":\"number\",\"description\":\"Number of authorized individuals per entity\"},{\"name\":\"first-reminder\",\"value\":\"1209600\",\"config_type\":\"duration\",\"description\":\"Duration between an initial disclosure request and the 1st automated reminder\"},{\"name\":\"second-reminder\",\"value\":\"1814400\",\"config_type\":\"duration\",\"description\":\"Duration between an initial disclosure request and the second automated reminder\"},{\"name\":\"delete-exhibit-forms-after\",\"value\":\"5184000\",\"config_type\":\"duration\",\"description\":\"Duration exhibit forms, once submitted, can survive in the ETT system before failure to send disclosure request(s) will result their deletion\"},{\"name\":\"delete-drafts-after\",\"value\":\"172800\",\"config_type\":\"duration\",\"description\":\"Duration that partially complete exhibit forms can survive in the ETT system before failure to submit them will result in their deletion\"},{\"name\":\"consent-expiration\",\"value\":\"315360000\",\"config_type\":\"duration\",\"description\":\"Duration an individuals consent is valid for before it automatically expires\"}]}";
  process.env.AWS_NODEJS_CONNECTION_REUSE_ENABLED = '1';
  process.env.DYNAMODB_CONFIG_TABLE_NAME = DynamoDbConstruct.getTableName(TableBaseNames.CONFIG);
  process.env.DYNAMODB_CONSENTER_TABLE_NAME = DynamoDbConstruct.getTableName(TableBaseNames.CONSENTERS);
  process.env.DYNAMODB_ENTITY_TABLE_NAME = DynamoDbConstruct.getTableName(TableBaseNames.ENTITIES);
  process.env.DYNAMODB_INVITATION_TABLE_NAME = DynamoDbConstruct.getTableName(TableBaseNames.INVITATIONS);
  process.env.DYNAMODB_USER_TABLE_NAME = DynamoDbConstruct.getTableName(TableBaseNames.USERS);

  const mockEvent = {
    "version": "1",
    "region": "us-east-2",
    "userPoolId": "us-east-2_o5a5mpJ7T",
    "userName": "618bd5b0-70f1-7046-ef4b-4bdca044bfcb",
    "callerContext": {
        "awsSdkVersion": "aws-sdk-unknown-unknown",
        "clientId": "e8dn547in0cm1ii23709291o9"
    },
    "triggerSource": "PreAuthentication_Authentication",
    "request": {
        "userAttributes": {
            "sub": "618bd5b0-70f1-7046-ef4b-4bdca044bfcb",
            "email_verified": "true",
            "cognito:user_status": "CONFIRMED",
            "phone_number_verified": "false",
            "phone_number": "+6174448888",
            "email": "cp1@warhen.work"
        },
        "validationData": null
    },
    "response": {}
  };

  handler(mockEvent)
    .then((retval:any) => {
      console.log(`Successful: ${JSON.stringify(retval, null, 2)}`);
    })
    .catch((e:any) => {
      JSON.stringify(e, Object.getOwnPropertyNames(e), 2);
    });
}