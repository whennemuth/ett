import { DeleteItemCommandOutput } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { IContext } from '../../../../contexts/IContext';
import * as ctx from '../../../../contexts/context.json';
import { DelayedExecutions } from '../../../DelayedExecution';
import { error, log, lookupCloudfrontDomain } from '../../Utils';
import { ID as scheduleTypeId, Description as scheduleDescription, StaleInvitationLambdaParms } from '../../functions/delayed-execution/RemoveStaleInvitations';
import { makeSafeHtml, sendEmail } from '../EmailWithAttachments';
import { Configurations } from '../config/Config';
import { DAOFactory, DAOInvitation } from '../dao/dao';
import { EntityCrud } from '../dao/dao-entity';
import { InvitationCrud } from '../dao/dao-invitation';
import { UserCrud } from '../dao/dao-user';
import { ConfigNames, Entity, Invitation, Roles, Role, User } from '../dao/entity';
import { DelayedLambdaExecution } from '../timer/DelayedExecution';
import { EggTimer, PeriodType } from '../timer/EggTimer';
import { SignupLink } from './SignupLink';
import { getHowEttWorksBase64 } from './how-ett-works';

export type SendParms = { expires?:boolean, persist?:boolean
}

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
  private _domain:string;
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
    // Add the code to the link and prevent any '&' or '=' characters from being misinterpreted as HTML.
    this._link = `${this._link}&code=${this._code}`
    const { CLOUDFRONT_DOMAIN, PRIMARY_DOMAIN } = process.env;
    this._domain = PRIMARY_DOMAIN || CLOUDFRONT_DOMAIN || new URL(this._link).hostname;
  }

  public send = async (parms:SendParms):Promise<boolean> => {
    const { expires=true, persist=true } = parms;
    const context:IContext = <IContext>ctx;
    let { invitation, entity_name, _link, messageId, persist:_persist, setDelayedExecutionToPurge } = this;
    let { role, email } = invitation;

    let heading:string = `Welcome to the Ethical Transparency Tool (ETT)!<br>`;

    switch(role) {

      case Roles.SYS_ADMIN:
        heading = `${heading}Follow this link to establish a system administrator account with ETT:<br>`;
        break;

      case Roles.RE_ADMIN:
        heading = `<b>${heading}Register for An ETT Account:<br>` +
          `Your University, College, or Society is being invited to register to use ETT. You are one of the ` +
          `three representatives of your University, College, or Society that is being invited to register ` +
          `to use ETT.<br>Follow this link to begin registration:` + 
          `<p>${makeSafeHtml('<a href="' + _link + '">' + _link + '</a>')}</p>` +
          `You are the Administrative Support Professional, who, with two senior Authorized Individuals, ` +
          `will represent your organization in using this tool.`;
        break;

      case Roles.RE_AUTH_IND:
        heading = `<b>${heading}Register for An ETT Account:<br>` +
          `Your University, College, or Society is being invited to register to use ETT. You are one of two ` +
          `senior Authorized Individuals who will represent your organization in using this tool, initiate ` +
          `(or authorize the Administrative Support Professional to initiate) Disclosure Requests, directly ` +
          `receive completed Disclosure Forms, and decide who at the organization needs the disclosed ` +
          `information (or confer with the organization official who has that authority).<br>Follow this link ` +
          `to complete registration:` +
          `<p>${makeSafeHtml('<a href="' + _link + '">' + _link + '</a>')}</p>`;
          break;
    }

    const { ETT_DOMAIN, ETT_EMAIL_FROM, OUTSIDE_LINKS: { 
      SOCIETIES_CONSORTIUM_LINK, PREVENTION_LINK, REPORT_LINK 
    } } = context;
    const howEttWorksImage = makeSafeHtml('<img src="cid:how-ett-works"/>');
    const ettLink = makeSafeHtml(`<a class="au" href="https://${this._domain}">Ethical Transparency Tool</a>`);
    const privacyLink = makeSafeHtml(`<a class="au" href="https://${this._domain}/privacy">Privacy Policy</a>`);
    const societiesLink = makeSafeHtml(`<a class="au" href="${SOCIETIES_CONSORTIUM_LINK}">Societies Consortium to End Harassment in STEMM</a>`);
    const preventionLink = makeSafeHtml(`<a class="au" href="${PREVENTION_LINK}">AAU's harassment prevention principles</a>`);
    const reportLink = makeSafeHtml(`<a class="au" href="${REPORT_LINK}">NASEM’s June 2018 report on sexual harassment of women</a>`);

    const message = `
      <style>
        div { float: initial; clear: both; padding: 20px; width: 500px; }
        hr { height: 1px; background-color: black; margin-bottom:20px; margin-top: 20px; border: 0px; }
        .content { max-width: 500px; margin: auto; }
        .heading1 { font: 16px Georgia, serif; background-color: #ffd780; text-align: center; }
        .entity1 { font: bold 18px Georgia, serif; color: crimson; }
        .body1 { font: italic 14px Georgia, serif; background-color: #ffe7b3; text-align: justify; }
        .direction1 { font: 16px Georgia, serif; background-color: #ffefcc; text-align: center; }
        .au { font-decoration: underline; }
      </style>
      <div class="content">
        <div class="heading1">${heading}</div>
        <p>&nbsp;</p>
        <div class="body1">
          <br>
          <b>ABOUT ETT</b><br>
          Welcome to the Ethical Transparency Tool (ETT)! 
          ETT is an ethical and efficient communication tool for societies, colleges, universities, and 
          individuals to lead by helping to create a norm of transparency about findings (not allegations) of 
          individuals’ misconduct (sexual/gender and race/ethnicity, as well as financial, 
          scientific/research, and licensure), wherever it occurs.  ETT is designed to implement 
          ${preventionLink} and the recommendations of ${reportLink} in academia and to support inclusive 
          learning and research for all talent.
        </div>
        <div class="body1">
          <br>
          <b>What are the benefits of ETT?</b><br>
          <ul>
            <li>
              Creating a healthy climate for all - avoiding awards and appointments for harassers, 
              while recognizing that a person may learn, correct past behaviors, and regain trust, benefiting everyone.
            </li>
            <li>
              Ethically treating everyone - making it easier for an entity that made a misconduct 
              finding (the most reliable source) to share it with an entity that requests it via 
              ETT.  Doing so with care for sensitive information and without shaming or whisper 
              campaigns.
            </li>
            <li>
              Minimizing legal and enterprise risk for all involved: organizations maintain 
              independence in all policy- and decision making; candidates provide consent for 
              disclosures; and disclosures are limited to useful but hard to dispute facts—the 
              kind and year of a misconduct finding.
            </li>
            <li>
              Enhancing efficiency in consenting to and requesting disclosures – a person’s single 
              consent has a 10-year life. It can be used to request and provide disclosures throughout 
              (by any ETT-Registered Entities and a consenting person’s professionally affiliated entities), 
              unless a person rescinds their consent early. ETT automates requests for disclosures and reminders.
            </li>
            <li style="font-weight:bold;">
              ETT never receives disclosures–only the organizations that request them using 
              ETT do - there is no centralized shame list or conduct record.
            </li>
          </ul>
        </div>
        <div class="body1">
          <br>
          <b>How does the Ethical Transparency Tool work?</b><br>
          ${howEttWorksImage}
        </div>
        <div class="body1">
          <br>
          <b>What information is retained in the ETT?</b><br>
          Organizations’ and individuals’ registration to use ETT and individuals’ consent forms 
          are stored in ETT.  Candidate professional affiliations (their employers, appointing and 
          honoring organizations, and societies - with contact information) and organization requests for disclosures are 
          deleted as soon as ETT sends them requests and two reminders. (A limited archival record of making 
          the transmission is kept behind a firewall.)  ETT is a conduit, not a records repository. 
          <p>
            Click these links for more information on the ${ettLink}, the ${privacyLink}, and the ${societiesLink}.
          </p>
        </div>
      </div>`;

      try {
        const sent = await sendEmail({
          subject: `${role == Roles.RE_ADMIN ? 'BU' : entity_name} Invitation to Register in ETT`,
          from: `${ETT_EMAIL_FROM}@${ETT_DOMAIN}`, 
          message,
          to: [ email ],
          pngAttachments: [
            {
              id: 'how-ett-works',
              pngBase64:getHowEttWorksBase64(),
              name: 'how-ett-works.png',
              description: 'how-ett-works.png'
            }
          ]  
        });
        if(sent && persist) {
  
          await _persist();
  
          if(expires) {
            await setDelayedExecutionToPurge();
          }
        }
        return sent;
      } 
      catch (e:any) {
        error(e);
        return false;
      }
  }

  /**
   * Registering the invitation to the database to reflect the email that would have just got sent.
   * NOTE: The email address itself is NOT saved (cannot do this until entity registration have occurred.)
   * @returns 
   */
  private persist = async ():Promise<any> => {
    try {
      const { invitation, entity_name, _code, messageId } = this;
      let { email, entity_id, role, sent_timestamp } = invitation;


      if( ! sent_timestamp) {
        sent_timestamp = new Date().toISOString();
      }

      const Payload = {
        code: _code, 
        email: _code,
        entity_id, 
        entity_name,
        role, 
        message_id: messageId,
        sent_timestamp
      } as Invitation;

      // A SYS_ADMIN should only have to go through the cognito stage of the registration process.
      if(role == Roles.SYS_ADMIN) {
        Payload.email = email;
        Payload.registered_timestamp = sent_timestamp
      }

      // Make sure email is NOT assigned the actual value, but the code value instead.
      const dao = DAOFactory.getInstance({ DAOType: 'invitation', Payload }) as DAOInvitation;

      return await dao.create();
    }
    catch (e:any) {
      error(e);
      return null;      
    }
  }

  /**
   * Set the delayed execution to purge the invitation from the database after the configured interval.
   */
  private setDelayedExecutionToPurge = async ():Promise<void> => {
    const { _code, invitation: { role, email, entity_id } } = this;
    const { ASP_INVITATION_EXPIRE_AFTER, STALE_AI_VACANCY } = ConfigNames;
    const envVarName = DelayedExecutions.RemoveStaleInvitations.targetArnEnvVarName;
    const functionArn = process.env[envVarName];
    const description = `${scheduleDescription} (invitation code:${_code})`;
    const configName = role == Roles.RE_ADMIN ? ASP_INVITATION_EXPIRE_AFTER : STALE_AI_VACANCY

    if(functionArn) {
      const configs = new Configurations();
      let waitTime = (await configs.getAppConfig(configName)).getDuration();
      if(configName == STALE_AI_VACANCY) {
        // Have the invitation expire 10 minutes AFTER the stale entity vacancy check for AIs occurs.
        waitTime += 600;
      }
      const lambdaInput = { invitationCode: _code, email, entity_id } as StaleInvitationLambdaParms;
      const delayedTestExecution = new DelayedLambdaExecution(functionArn, lambdaInput);
      const { SECONDS } = PeriodType;
      const timer = EggTimer.getInstanceSetFor(waitTime, SECONDS); 
      await delayedTestExecution.startCountdown(timer, scheduleTypeId, description);
    }
    else {
      console.error(`Cannot schedule ${description}: ${envVarName} variable is missing from the environment!`);
    }
  }

  public static retractInvitation = async (code:string):Promise<void> => {
    let failMessage = '';
    const dao = InvitationCrud({ code } as Invitation);
    const output = await dao.Delete(true) as DeleteItemCommandOutput;
    if((output.$metadata.httpStatusCode ?? 0) < 200 || (output.$metadata.httpStatusCode ?? 0) > 299) {
      failMessage = `HTTP status code: ${(output.$metadata.httpStatusCode ?? 0)}`;
      throw new Error(failMessage);
    }
    if( ! output.Attributes || ! output.Attributes.code) {
      failMessage = 'No invitation found';
      throw new Error(failMessage);
    }
    log(code, `Invitation retraction failed`);    
  }

  public get code():string {
    return this._code;
  }

  public get link():string {
    return this._link;
  }
}




/**
 * RUN MANUALLY:
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/invitation/Invitation.ts')) {

  let inviterEmail:string;
  let inviteeEmail:string;
  const role:Role = Roles.RE_ADMIN as Role;
  switch(role) {
    case Roles.RE_ADMIN:
      inviterEmail = 'sysadmin1@warhen.work';
      inviteeEmail = 'asp1.random.edu@warhen.work';
      break;
    case Roles.RE_AUTH_IND: default:
      inviterEmail = 'asp1.random.edu@warhen.work';
      inviteeEmail = 'auth1.random.edu@warhen.work';
      break;
  }
  const task = 'send' as 'send' | 'retract';

  (async () => {
    // Get context variables
    const context:IContext = await require('../../../../contexts/context.json');
    const { REGION, TAGS: { Landscape }} = context;

    if(task == 'retract') {
      const code = '45e4b462-eacc-4660-b9b2-2a750ea19f47';
      try {
        await UserInvitation.retractInvitation(code);
        log(code, 'Invitation retracted');
      }
      catch(e:any) {
        error(e, 'Invitation retraction failed');
      }
      return;
    }

    // Get the cloudfront domain
    const cloudfrontDomain = await lookupCloudfrontDomain(Landscape);
    if( ! cloudfrontDomain) {
      throw('Cloudfront domain lookup failure');
    }

    // Set environment variables
    process.env.REGION = REGION;
    process.env.CLOUDFRONT_DOMAIN = cloudfrontDomain;

    // Get the inviter
    const inviters = await UserCrud({ userinfo: { email:inviterEmail } as User }).read() as User[];
    if(inviters.length == 0) {
      log(`${inviterEmail} not found!`);
      return;
    }
    if(inviters.length > 1) {
      log(inviters, `${inviterEmail} found in multiple entities. You will have to specify the entity_id`);
      return;
    }

    // Get the link to put in the invitation email
    const entity_id = inviters[0].entity_id;
    // const registrationUri = 'https://' + cloudfrontDomain + '/bootstrap/index.htm';
    const registrationUri = 'https://' + cloudfrontDomain + '/entity/register';
    const link = await new SignupLink().getRegistrationLink({ email:inviteeEmail, entity_id, registrationUri });
    
    // Get the entity
    const entity = await EntityCrud({ entity_id } as Entity).read() as Entity;
    const { entity_name } = entity;
    const invitation = { entity_id, email:inviteeEmail, role } as Invitation
    const emailInvite = new UserInvitation(invitation, `${link}`, entity_name);
    if( await emailInvite.send({ expires:false, persist:false }) ) {
      log({ invitation_code: emailInvite.code, invitation_link: emailInvite.link }, 'Invitation successfully sent');
    }
    else {
      log(`Invitation failure: ${emailInvite.code}`);
    } 
  })();
}
