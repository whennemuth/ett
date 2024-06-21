import { Invitation, Role, Roles } from '../dao/entity';
import { DAOInvitation, DAOFactory } from '../dao/dao';
import { SESv2Client, SendEmailCommand, SendEmailCommandInput, SendEmailResponse } from '@aws-sdk/client-sesv2';
import { v4 as uuidv4 } from 'uuid';
import { ENTITY_WAITING_ROOM } from '../dao/dao-entity';

/**
 * An invitation email is one sent with a link in it to the ETT privacy policy acknowledgement webpage as the
 * starting point for their account signup. The link has a special code in it that has also been logged into 
 * the backend database, and so anyone accepting the invitation by following the link will arrive at the 
 * registration form for the website. They will only be able to progress through the registration process if the
 * code is detected and passed along with each registration step to the backend where screening lambda functions
 * lookup the code in the database for a match as a precondition to carrying out that registration step. 
 * Any random visitor to the registration form (with no valid code) will be turned away as "uninvited".
 */
export class UserInvitation {

  private invitation:Invitation;
  private _code:string;
  private _link:string;
  private entity_name:string;
  private messageId:string|undefined;

  /**
   * The invitation email is to be sent and an entry created in the database.
   * @param invitation 
   * @param link 
   */
  constructor(invitation:Invitation, link:string, entity_name:string) {
    if( ! link) {
      throw new Error('Missing invitation link for invitation email!');
    }
    this.invitation = invitation as Invitation;
    this.entity_name = entity_name;
    this._link = link;

    // If an invitation code is not provided, generate one.
    let { code } = invitation;
    if( ! code) code = uuidv4();
    this._code = code;
    this._link = `${this._link}&code=${this._code}`
  }

  /**
   * Send the invitation email.
   * @returns 
   */
  public send = async ():Promise<boolean> => {
    // Destructure the invitation and get a description of the role invited for.
    let { role, email } = this.invitation;
    let role_description = '';
    let role_fullname = '';
    switch(role as Role) {
      case Roles.SYS_ADMIN:
        role_fullname = 'System Administrator';
        role_description = 'A system administrator for the entire ETT plaform. Actions that can be taken \
          by a system adminstrator are not entity-specific and involve, among other functions, the \
          invitation of registered entity administrators to the platform to register and create their entities. '
        break;
      case Roles.RE_ADMIN:
        role_fullname = 'Registered Entity Administrator';
        role_description = 'A person who directly works with one or both of the RE Authorized Individuals \
          and can assist them in interacting with the ETT technology—and who can manage the registered entities \
          involvement in the ETT, including by making requests for Individuals to complete Consent or Affiliate \
          Exhibit Forms.'
        break;
      case Roles.RE_AUTH_IND:
        role_fullname = 'Registered Entity Authorized Individual';
        role_description = 'A person in a senior role(s) within a registered entity that deals with \
          sensitive information, who will directly view the completed Disclosure Form on behalf of the \
          registered entity. Each registered entity has two Authorized Individuals'
        break;
    }

    let heading:string = `You are invited to register as a ${role_fullname} in the Ethical Transparency Application`;
    if(this.entity_name != ENTITY_WAITING_ROOM) {
    // if(this.entity_name && this.entity_name != ENTITY_WAITING_ROOM) {
        heading = `${heading} for the following organization: <br><br><span class="entity1">${this.entity_name}</span>`;
    }
    
    // Send the invitation email
    const client = new SESv2Client({
      region: process.env.REGION
    });
    
    const command = new SendEmailCommand({
      Destination: {
        ToAddresses: [ email ]
      },
      FromEmailAddress: email,
      Content: {
        Simple: {
          Subject: {
            Charset: 'utf-8',
            Data: 'INVITATION: Ethical Transparency Tool (ETT)',
          },          
          Body: {
            // Text: { Charset: 'utf-8', Data: 'This is a test' },
            Html: {
              Charset: 'utf-8',
              Data: `
                <style>
                  div { float: initial; clear: both; padding: 20px; width: 500px; }
                  hr { height: 1px; background-color: black; margin-bottom:20px; margin-top: 20px; border: 0px; }
                  .content { max-width: 500px; margin: auto; }
                  .heading1 { font: 16px Georgia, serif; background-color: #ffd780; text-align: center; }
                  .entity1 { font: bold 18px Georgia, serif; color: crimson; }
                  .body1 { font: italic 14px Georgia, serif; background-color: #ffe7b3; text-align: justify;}
                  .direction1 { font: 16px Georgia, serif; background-color: #ffefcc; text-align: center; }
                </style>
                <div class="content">
                  <div class="heading1">${heading}</div>
                  <div class="body1" style="padding:20px;">
                    <hr>
                    ETT is designed to support AAU’s harassment prevention principles and the recommendations of 
                    NASEM’s June 2018 report on sexual harassment of women in academic science, engineering, and 
                    medicine by helping to create a norm of transparency about findings of misconduct against a 
                    person, across the higher-education and research ecosystem of societies, institutions of higher 
                    education, and other research organizations. This tool covers sexual, gender, and racial 
                    misconduct — as well as professional licensure, financial, and research misconduct to maximize 
                    its utility.
                    <br>
                    <hr>
                    A ${role_fullname} is: ${role_description}
                  </div>
                  <div class="direction1">
                    Click <a href="${this._link}" style="font-weight: bold;">here</a> to register
                  </div></div>
                </div>`,
            }
          }
        }
      }
    } as SendEmailCommandInput);

    try {
      const response:SendEmailResponse = await client.send(command);
      this.messageId = response?.MessageId;
      if(this.messageId) {
        await this.persist();
      }
    } 
    catch (e:any) {
      console.log(e);
      return false;
    }
    return this.messageId ? true : false;
  }

  /**
   * Registering the invitation to the database to reflect the email that would have just got sent.
   * NOTE: The email address itself is NOT saved (cannot do this until acknowledgement and entity registration have occurred.)
   * @returns 
   */
  private persist = async ():Promise<any> => {
    try {
      let { email, entity_id, role, sent_timestamp } = this.invitation;

      if( ! sent_timestamp) {
        sent_timestamp = new Date().toISOString();
      }

      const Payload = {
        code: this._code, 
        email: this._code,
        entity_id, 
        role, 
        message_id: this.messageId,
        sent_timestamp
      } as Invitation;

      // A SYS_ADMIN should only have to go through the cognito stage of the registration process.
      if(role == Roles.SYS_ADMIN) {
        Payload.email = email;
        Payload.acknowledged_timestamp = sent_timestamp,
        Payload.registered_timestamp = sent_timestamp
      }

      // Make sure email is NOT assigned the actual value, but the code value instead.
      const dao = DAOFactory.getInstance({ DAOType: 'invitation', Payload }) as DAOInvitation;

      return await dao.create();
    }
    catch (e:any) {
      console.log(e);
      return null;      
    }
  }

  public get code():string {
    return this._code;
  }

  public get link():string {
    return this._link;
  }
}
