import { AdminCreateUserCommand, AdminCreateUserCommandOutput, AdminCreateUserRequest, AdminDeleteUserCommand, AdminDeleteUserCommandOutput, AdminDeleteUserRequest, AdminGetUserCommand, AdminGetUserCommandOutput, AdminGetUserRequest, AdminGetUserResponse, AdminSetUserPasswordCommand, AdminUpdateUserAttributesCommand, AdminUpdateUserAttributesCommandOutput, AdminUpdateUserAttributesRequest, AttributeType, CognitoIdentityProviderClient, UserType } from "@aws-sdk/client-cognito-identity-provider";
import { StandardAttributes } from "aws-cdk-lib/aws-cognito";
import { IContext } from "../../../../contexts/IContext";
import { debugLog, error, log } from "../../Utils";
import { Role, Roles } from "../dao/entity";
import { lookupUserPoolId } from "./Lookup";

export type AttributeValue = {
  propname:string, 
  value: string|undefined,
  verified?:boolean
}
export type CognitoStandardAttributes = {
  -readonly [K in keyof StandardAttributes]: AttributeValue;
}

/**
 * This class serves as a utility for performing CRUD operations against a user account in a cognito
 * userpool.
 */
export class UserAccount {
  private role:Role;
  private region:string;
  private UserPoolId:string;
  private UserAttributes = [] as AttributeType[];
  private message:string = 'ok';

  private constructor() { /** Do nothing */ }

  /**
   * Factory method for instances of this class. Can be used as the "read" CRUD operation as it 
   * returns a UserAccount object corresponding to the email attribute provided.
   * @param cognitoAttributes 
   * @param role 
   * @returns 
   */
  public static getInstance = async (cognitoAttributes:CognitoStandardAttributes, role:Role):Promise<UserAccount> => {
    const user = new UserAccount();
    const { REGION, PREFIX, USERPOOL_ID } = process.env;
    if( ! REGION) {
      throw new Error('UserAccount.getInstance: Environment variable REGION is not defined');
    }

    user.role = role;
    user.region = REGION;
    user.UserAttributes.push(...UserAccount.getUserAttributes(cognitoAttributes));

    // Get userpool ID directly from the environment
    let id = USERPOOL_ID;
    if(id) {
      user.UserPoolId = id;
      return user;    
    }

    if( ! PREFIX) {
      throw new Error('UserAccount.getInstance: Environment variable PREFIX is not defined');
    }

    // If undefined, get userpool ID by looking it up against the userpool name
    const userPoolName = `${PREFIX}-cognito-userpool`;
    id = await lookupUserPoolId(userPoolName, user.region);
    if( ! id) {
      throw new Error(`Userpool ID lookup failed! UserAccount.getInstance(${JSON.stringify({
        cognitoAttributes, role
      }, null, 2)})`);
    }

    user.UserPoolId = id;
    return user;  
  }

  /**
   * Transform a CognitoAttributes object into an AttributeType array.
   * @param cognitoAttributes 
   * @returns 
   */
  private static getUserAttributes = (cognitoAttributes:CognitoStandardAttributes):AttributeType[] => {
    const { email:emailAttr, phoneNumber:phoneAttr } = cognitoAttributes;
    const userAttributes = [] as AttributeType[];
    if(emailAttr) {
      userAttributes.push({ Name:emailAttr.propname, Value:emailAttr.value });
      if(emailAttr.verified) {
        userAttributes.push({ Name:`${emailAttr.propname}_verified`, Value:'true' });
      }
    }
    if(phoneAttr) {
      userAttributes.push({Name:phoneAttr.propname, Value:phoneAttr.value });
      if(phoneAttr.verified) {
        userAttributes.push({ Name:`${phoneAttr.propname}_verified`, Value:'true' });
      }

    }
    return userAttributes;    
  }

  public read = async ():Promise<AdminGetUserCommandOutput|void> => {
    const { UserPoolId, region, getEmail, logError } = this;

    try {
      const Username = getEmail();
      const client = new CognitoIdentityProviderClient({ region });
      const input = {  UserPoolId, Username } as AdminGetUserRequest;
      const command = new AdminGetUserCommand(input);
      const response = await client.send(command) as AdminGetUserCommandOutput;
      debugLog(response);
      return response;
    } 
    catch(e:any) {
      if( e?.name && e?.name == 'UserNotFoundException') {
        log(`User ${getEmail()} not found in userpool: ${UserPoolId}`);
        return;
      }
      logError(e as Error);
    }
  }

  public isVerified = async (user?:AdminGetUserCommandOutput):Promise<boolean> => {
    const { logError, read } = this;
    try {
      if( ! user) {
        user = await read() as AdminGetUserCommandOutput;
      }
      const emailAttribute = user?.UserAttributes?.find((a:AttributeType) => a.Name == 'email_verified');
      const phoneAttribute = user?.UserAttributes?.find((a:AttributeType) => a.Name == 'phone_number_verified');
      return emailAttribute?.Value == 'true' || phoneAttribute?.Value == 'true';
    } 
    catch(e) {
      logError(e as Error);
      return false;
    }
  }

  /**
   * Update the email and/or phone_number attributes of a user in the userpool. This requires that these
   * attributes are configured to be mutable. Modification of the email address attribute will trigger an 
   * automatic email to the new email address with a verification code and the email of the user will be
   * switched to unverified (NOTE: since the user is already confirmed, and there is no way to demote a 
   * user as unconfirmed using the SDK, the hosted UI verification prompt will not appear during a log
   * in attempt, and unconventional workarounds with the preauthentication lambda trigger, flags, and
   * redirects at the app dashboard screen would be necessary to make it work)
   * @param cognitoAttributes 
   */
  public update = async (cognitoAttributes:CognitoStandardAttributes):Promise<boolean> => {
    const { UserPoolId, region, getEmail, logError } = this;
    const { getUserAttributes } = UserAccount;

    try {
      const email = getEmail(); 
      const AllAttributes = getUserAttributes(cognitoAttributes);
      const UserAttributes = AllAttributes.filter(a => a.Name != 'email'); // Remove the email attribute
      const client = new CognitoIdentityProviderClient({ region });
      const input = { UserPoolId, Username: email, UserAttributes } as AdminUpdateUserAttributesRequest;
      const command = new AdminUpdateUserAttributesCommand(input);

      const response = await client.send(command) as AdminUpdateUserAttributesCommandOutput;
      debugLog(response);
      const code = response.$metadata.httpStatusCode ?? 200; // Assume ok if no code returned.
      if( ! (code >= 200 && code < 300)) {
        throw new Error(`Update of user in userpool failed, status code: ${code}`);
      }
      return true;
    }
    catch(e) {
      logError(e as Error);
      return false;
    }
  }

  /**
   * Swap out a user in a cognito userpool by deleting that user and replacing them with a new
   * user whose attributes are provided. The user should receive an email at the new address
   * with a temporary password and a link to the hosted UI to log in, which both confirms the user
   * and verifies the new email in one shot.
   * @param cognitoAttributes 
   */
  public replaceWith = async (cognitoAttributes:CognitoStandardAttributes):Promise<UserType|undefined> => {
    const { role, Delete, ok } = this;
    const newUser = await UserAccount.getInstance(cognitoAttributes, role);
    const user = await newUser.create(this) as UserType;
    if( ! user) {
      return;
    }
    await Delete();
    return user;
  }

  public create = async (userBeingReplaced?:UserAccount):Promise<UserType|undefined> => {
    return this._create('RESEND', userBeingReplaced)
  }

  public createWithPassword = async (Password:string):Promise<UserType|undefined> => {
    const { UserPoolId, region, getEmail, logError } = this;
    let user:UserType|undefined = undefined;
    try {
      user = await this._create('SUPPRESS');

      const Username = getEmail();
      const client = new CognitoIdentityProviderClient({ region });

      await client.send(new AdminSetUserPasswordCommand({
        UserPoolId, Username, Password, Permanent: true
      }));
    }
    catch(e) {
      logError(e as Error);
    }
    finally {
      return user;
    }
  }

  /**
   * Create the cognito user account
   * @param userBeingReplaced 
   * @returns 
   */
  private _create = async (MessageAction:string, userBeingReplaced?:UserAccount):Promise<UserType|undefined> => {
    const { UserPoolId, region, UserAttributes, role, getEmail, logError } = this;
    let user:UserType|undefined = undefined;

    try {
      const Username = getEmail();
      // Uncomment "SMS" if you want the welcome message to be sent to the sms number as well.
      const DesiredDeliveryMediums = [
        "EMAIL", 
        // "SMS",
      ];

      const client = new CognitoIdentityProviderClient({ region });
      // NOTE: role could be put in ValidationData, but this is available to the resignup trigger instead of ALL triggers.
      const ClientMetadata = { role } as Record<string, string>

      if(userBeingReplaced) {
        ClientMetadata.old_email = `${userBeingReplaced.getEmail()}`;
      }

      const input = {
        UserPoolId,
        Username,
        UserAttributes,
        ForceAliasCreation: false,
        MessageAction,
        DesiredDeliveryMediums,        
        ClientMetadata,
      } as AdminCreateUserRequest;

      if(MessageAction === 'RESEND') {
        // MessageAction should default to "RESEND", but I suspect a difference in behavior by setting it this way.
        // NOTE: "RESEND" is a misnomer in this user creation context, and just means "SEND"
        delete input.MessageAction;
      }

      const command = new AdminCreateUserCommand(input);
      const response = await client.send(command) as AdminCreateUserCommandOutput;

      log(response, 'Created new cognito user account');
      user = response.User;
    }
    catch(e) {
      logError(e as Error);
    }
    finally {
      return user;
    }
  }

  /**
   * Delete the cognito user account
   */
  public Delete = async ():Promise<boolean> => {
    const { UserPoolId, region, getEmail, logError } = this;
    try {
      const Username = getEmail();
      const client = new CognitoIdentityProviderClient({ region });
      const input = {  UserPoolId, Username } as AdminDeleteUserRequest;
      const command = new AdminDeleteUserCommand(input);
      const response = await client.send(command) as AdminDeleteUserCommandOutput;
      debugLog(response);
      const code = response.$metadata.httpStatusCode ?? 200; // Assume ok if no code returned.
      if( ! (code >= 200 && code < 300)) {
        throw new Error(`Delete of user in userpool failed, status code: ${code}`);
      }
      return true;
    }
    catch(e) {
      logError(e as Error);
      return false;
    }
  }
    
  private logError = (e:Error) => {
    this.message = e.message;
    error(e);
  }

  public getEmail = ():string|undefined => {
    return this.UserAttributes.find(a => a.Name == 'email')?.Value;
  }

  public getRole = ():Role => {
    return this.role;
  }

  public getMessage = ():string => {
    return this.message
  }

  public ok = ():boolean => {
    return this.message == 'ok';
  }
}




/**
 * RUN MANUALLY:
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/cognito/UserAccount.ts')) {

  let task = 'is-verified' as 'read'| 'is-verified' | 'replace' | 'update' | 'create' | 'create-password';

  (async () => {

    // 1) Get context variables
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, REGION, TAGS: { Landscape }} = context;

    // 2) Set the environment variables
    process.env.REGION = REGION;
    process.env.PREFIX = `${STACK_ID}-${Landscape}`;
    process.env.DEBUG = 'true';

    // 3) Define the original and updated user parameters
    let original:CognitoStandardAttributes;
    let updated:CognitoStandardAttributes

    // 4) Execute the update or replacement
    let user:UserAccount;
    switch(task) {
      case "read":
        original = { email: { propname:'email', value:'sysadmin1@warhen.work' } };
        // Make the email address the same so as not to get updated itself.
        user = await UserAccount.getInstance(original, Roles.SYS_ADMIN);
        const userDetails = await user.read();
        log(userDetails, 'User details');
        break;
      case "is-verified":
        original = { email: { propname:'email', value:'bogus@warhen.work' } };
        // Make the email address the same so as not to get updated itself.
        user = await UserAccount.getInstance(original, Roles.SYS_ADMIN);
        const verified = await user.isVerified();
        console.log(`User is verified: ${verified}`);
        break;
      case "update":
        original = { email: { propname:'email', value:'cp1@warhen.work' } };
        updated = {
          email: { propname:'email', value:'cp2@warhen.work' }, 
          phoneNumber: { propname: 'phone_number', value: '+1234567890' }
        };
        // Make the email address the same so as not to get updated itself.
        user = await UserAccount.getInstance(original, Roles.CONSENTING_PERSON);
        updated.email!.value = original.email?.value;
        await user.update(updated);
        break;
      case "replace":
        original = { email: { propname:'email', value:'cp1@warhen.work' } };
        updated = {
          email: { propname:'email', value:'cp2@warhen.work' }, 
          phoneNumber: { propname: 'phone_number', value: '+1234567890' }
        };
        user = await UserAccount.getInstance(original, Roles.CONSENTING_PERSON);
        await user.replaceWith(updated);
        break;
      case "create":
        original = {
          email: { propname:'email', value:'asp1.random.edu@warhen.work', verified:true }, 
          phoneNumber: { propname: 'phone_number', value: '+1234567890' }
        };
        user = await UserAccount.getInstance(original, Roles.RE_ADMIN);
        await user.create();
        break;
      case "create-password":
        original = {
          email: { propname:'email', value:'asp1.random.edu@warhen.work', verified:true }, 
          phoneNumber: { propname: 'phone_number', value: '+1234567890' }
        };
        user = await UserAccount.getInstance(original, Roles.RE_ADMIN);
        await user.createWithPassword('passWORD123!@#');
        break;
    }
    
    // 5) Report the results
    if(user.ok()) {
      console.log(`${task} successful`);
    }
    else {
      console.log(user.getMessage());
    }
  })();

}