import { Invitation, Role, Roles } from '../dao/entity' 
import { DAO, DAOFactory } from '../dao/dao'
import { SESv2Client, SendEmailCommand, SendEmailResponse } from '@aws-sdk/client-sesv2';

/**
 * An invitation email is one sent with a link in it to a public signin url (cognito userpool client hosted UI).
 * This invitation is logged into the backend database and anyone accepting the invitation and attempting to
 * signup through the cognito userpool client "doorway" the link targets will trigger a screening lambda function
 * that will lookup the email in the database for pending invitations before letting the user through. 
 * Any random visitor to the signup url will be turned away if they are "uninvited".
 */
export class InvitationEmail {

  private invitation:Invitation;

  constructor(invitation:Invitation) {
    this.invitation = invitation;
  }

  public send = async ():Promise<boolean> => {

    // Destructure the invitation and get a description of the role invited for.
    const { email, entity_name, role, link } = this.invitation;
    let role_description = '';
    switch(role as Role) {
      case Roles.RE_ADMIN:
        role_description = 'A person who directly works with one or both of the RE Authorized Individuals \
          and can assist them in interacting with the ETT technology—and who can manage the registered entities \
          involvement in the ETT, including by making requests for Individuals to complete Consent or Affiliate \
          Exhibit Forms.'
        break;
      case Roles.RE_AUTH_IND:
        role_description = 'A person in a senior role(s) within a registered entity that deals with \
          sensitive information, who will directly view the completed Disclosure Form on behalf of the \
          registered entity. Each registered entity has two Authorized Individuals'
        break;
    }
    
    // Send the invitation email
    const client = new SESv2Client();
    const command = new SendEmailCommand({
      Content: {
        Simple: {
          Subject: {
            Charset: 'utf-8',
            Data: 'INVITATION: Ethical Transparency Application',
          },
          Body: {
            Html: {
              Charset: 'utf-8',
              Data: `
                <html>
                <body>
                  <head>
                    <style>
                      body { background: #555; }
                      div { float: initial; clear: both; padding: 20px; width: 500px; }
                      hr { height: 1px; background-color: black; margin-bottom:20px; margin-top: 20px; border: 0px; }
                      .content { max-width: 500px; margin: auto; }
                      .heading1 { font: 16px Georgia, serif; background-color: #ffd780; text-align: center; }
                      .entity1 { font: bold 18px Georgia, serif; color: crimson; }
                      .body1 { font: italic 14px Georgia, serif; background-color: #ffe7b3; text-align: justify;}
                      .direction1 { font: 16px Georgia, serif; background-color: #ffefcc; text-align: center; }
                    </style>
                  </head>
                  <div class="content">
                    <div class="heading1">
                      You are invited to register as ${role} in the Ethical Transparency Application for the following
                      organization: <br><br><span class="entity1">${entity_name}</span>
                    </div>
                    <div class="body1">
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
                      A ${role} is: ${role_description}
                    </div>
                    <div class="direction1">
                      Click <a href="${link}" style="font-weight: bold;">here</a> to register
                    </div></div>
                  </div>
                </body>
              </html>`,
            }
          }
        }
      }
    });

    let msgId;
    try {
      const response:SendEmailResponse = await client.send(command);
      msgId = response?.MessageId
    } 
    catch (e:any) {
      console.log(e);
      return false;
    }
    return msgId ? true : false;
  }

  public persist = async () => {
    const { email, entity_name, role } = this.invitation;

    const dao:DAO = DAOFactory.getInstance({ DAOType: 'invitation', Payload: {
      email, entity_name, role
    }});

    await dao.create();
  }

  public accept = () => {
    // RESUME NEXT: write this function
  }
}
