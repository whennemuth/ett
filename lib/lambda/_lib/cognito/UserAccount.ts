import { AdminCreateUserCommand, AdminCreateUserCommandOutput, AdminCreateUserRequest, AdminDeleteUserCommand, AdminDeleteUserCommandOutput, AdminDeleteUserRequest, AdminUpdateUserAttributesCommand, AdminUpdateUserAttributesCommandOutput, AdminUpdateUserAttributesRequest, AttributeType, CognitoIdentityProviderClient, UserType } from "@aws-sdk/client-cognito-identity-provider";
import { StandardAttributes } from "aws-cdk-lib/aws-cognito";
import { lookupUserPoolId } from "./Lookup";
import { debugLog, log } from "../../Utils";
import { IContext } from "../../../../contexts/IContext";
import { Role, Roles } from "../dao/entity";

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

  /**
   * Factory method for instances of this class. Can be used as the "read" CRUD operation as it 
   * returns a UserAccount object corresponding to the email attribute provided.
   * @param cognitoAttributes 
   * @param role 
   * @returns 
   */
  public static getInstance = async (cognitoAttributes:CognitoStandardAttributes, role:Role):Promise<UserAccount> => {
    const user = new UserAccount();

    user.role = role;
    user.UserAttributes.push(...UserAccount.getUserAttributes(cognitoAttributes));

    // Get environment variables
    user.region = process.env.REGION ?? 'us-east-2';
    const prefix = process.env.PREFIX;

    // Get the userpool ID
    const userPoolName = `${prefix}-cognito-userpool`;

    const id = await lookupUserPoolId(userPoolName, user.region);
    if( ! id) {
      throw new Error('Userpool ID lookup failed!');
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

  /**
   * Create the cognito user account
   * @param userBeingReplaced 
   * @returns 
   */
  public create = async (userBeingReplaced?:UserAccount):Promise<UserType|undefined> => {
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
        // MessageAction: "RESEND", // Note: "RESEND" is a misnomer in this user creation context, and just means "SEND"
        DesiredDeliveryMediums,        
        ClientMetadata,
      } as AdminCreateUserRequest;
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
        throw new Error(`Update of user in userpool failed, status code: ${code}`);
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
    log(e);
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
if(args.length > 3 && args[2] == 'RUN_MANUALLY_COGNITO_USER_UPDATE') {

  const task = args[3] as 'update' | 'replace';

  (async () => {

    // 1) Get context variables
    const context:IContext = await require('../../../../contexts/context.json');
    const { STACK_ID, REGION, TAGS: { Landscape }} = context;

    // 2) Set the environment variables
    process.env.REGION = REGION;
    process.env.PREFIX = `${STACK_ID}-${Landscape}`;
    process.env.DEBUG = 'true';

    // 3) Configure the original and updated user parameters
    const original = { email: { propname:'email', value:'cp1@warhen.work' } } as CognitoStandardAttributes;
    const updated = {
      email: { propname:'email', value:'cp2@warhen.work' }, 
      phoneNumber: { propname: 'phone_number', value: '+1234567890' }
    } as CognitoStandardAttributes

    // 4) Execute the update or replacement
    const user = await UserAccount.getInstance(original, Roles.CONSENTING_PERSON);
    switch(task) {
      case "update":
        // Make the email address the same so as not to get updated itself.
        updated.email!.value = original.email?.value;
        await user.update(updated);
        break;
      case "replace":
        await user.replaceWith(updated);
        break;
    }
    
    // 5) Report the results
    if(user.ok()) {
      console.log('Update complete.');
    }
    else {
      console.log(user.getMessage());
    }
  })();

}