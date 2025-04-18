import { DelayedExecutions } from "../../../DelayedExecution";
import { LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { Configurations } from "../../_lib/config/Config";
import { DAOFactory } from "../../_lib/dao/dao";
import { Affiliate, AffiliateTypes, ConfigNames, Consenter, Entity, ExhibitForm, FormTypes, Roles, User, YN } from "../../_lib/dao/entity";
import { ExhibitFormParms } from '../../_lib/pdf/ExhibitForm';
import { DelayedLambdaExecution } from "../../_lib/timer/DelayedExecution";
import { EggTimer, PeriodType } from "../../_lib/timer/EggTimer";
import { deepClone, error, errorResponse, invalidResponse, log } from "../../Utils";
import { Description as S3ScheduleDescription, ID as S3ScheduleId } from "../delayed-execution/PurgeExhibitFormFromBucket";
import { DisclosureItemsParms } from "./BucketItem";
import { BucketDisclosureForm } from "./BucketItemDisclosureForm";
import { BucketExhibitForm } from "./BucketItemExhibitForm";
import { BucketItemMetadata, BucketItemMetadataParms, ItemType } from "./BucketItemMetadata";
import { INVALID_RESPONSE_MESSAGES } from "./ConsentingPerson";
import { ConsenterInfo, consentFormUrl, getConsenterInfo, getConsenterResponse } from "./ConsentingPersonUtils";
import { ConsentStatus } from "./ConsentStatus";
import { ExhibitEmail, ExhibitEmailOverrides } from "./ExhibitEmail";


/**
 * Send full exhibit form to each authorized individual of the entity, remove it from the database, and save
 * each constituent single exhibit form to s3 for temporary storage.
 * @param consenterEmail 
 * @param exhibitForm 
 * @returns 
 */
export class ExhibitDataSender {
  private consenterEmail:string;
  private exhibitForm:ExhibitForm;

  private emailSendFailures = [] as string[];
  private emailFailures = () => { return this.emailSendFailures.length > 0; }

  private bucketItemAddFailures = [] as string[];
  private bucketAddFailures = () => { return this.bucketItemAddFailures.length > 0; }
  
  private affiliates = [] as Affiliate[];
  private badResponse:LambdaProxyIntegrationResponse|undefined;
  private entity_id:string|undefined;
  private consenter = {} as Consenter;
  private entity = {} as Entity;
  private entityReps = [] as User[];

  constructor(consenterEmail:string, exhibitForm:ExhibitForm) {
    this.consenterEmail = consenterEmail;
    this.exhibitForm = exhibitForm; 
  }

  private throwError = (msg:string, payload?:any) => {
    this.badResponse = invalidResponse(msg, payload);
    throw new Error(msg);
  }

  private validatePayload = () => {
    const { exhibitForm, consenterEmail, throwError } = this;
    // Validate incoming data
    if( ! exhibitForm) {
      throwError(INVALID_RESPONSE_MESSAGES.missingExhibitData);
    }
    let { affiliates: _affiliates, entity_id: _entity_id } = exhibitForm as ExhibitForm;
    if( ! _entity_id ) {
      throwError(INVALID_RESPONSE_MESSAGES.missingEntityId);
    }
    this.entity_id = _entity_id;
    if( ! consenterEmail) {
      throwError(INVALID_RESPONSE_MESSAGES.missingExhibitFormIssuerEmail);
    }

    // Emails with upper case letters are not valid in the database, so convert to lower case.
    this.consenterEmail = consenterEmail.toLowerCase();

    // Validate incoming affiliate data
    if(_affiliates && _affiliates.length > 0) {
      for(const affiliate of _affiliates) {
        let { affiliateType, email, fullname, org, phone_number, title } = affiliate;

        if( ! Object.values<string>(AffiliateTypes).includes(affiliateType)) {
          throwError(`${INVALID_RESPONSE_MESSAGES.invalidAffiliateRecords} - affiliatetype: ${affiliateType}`);
        }
        if( ! email) {
          throwError(`${INVALID_RESPONSE_MESSAGES.invalidAffiliateRecords}: email`);
        }
        if( ! fullname) {
          throwError(`${INVALID_RESPONSE_MESSAGES.invalidAffiliateRecords}: fullname`);
        }
        if( ! org) {
          throwError(`${INVALID_RESPONSE_MESSAGES.invalidAffiliateRecords}: org`);
        }
        // TODO: Should phone_number and title be left optional?
      };
    }
    else {
      throwError(INVALID_RESPONSE_MESSAGES.missingAffiliateRecords);
    }

    if(_affiliates) {
      if(_affiliates instanceof Array) {
        this.affiliates.push(... _affiliates as Affiliate[]);
      }
      else {
        this.affiliates.push(_affiliates);
      }
    }
  }

  /**
   * If the consenter did not save their last exhibit form entries before submitting them, their database
   * record will not reflect those latest entries, so merge the two now.
   */
  private mergeExhibitFormIntoConsenterData = () => {
    log('Merging exhibit form into consenter data...');
    const { consenter, consenter:{ exhibit_forms=[] }, exhibitForm,  } = this;
    const efIdx = exhibit_forms.findIndex(ef => {
      return ef.entity_id == exhibitForm.entity_id && ef.constraint == exhibitForm.constraint;
    });
    if(efIdx == -1) {
      exhibit_forms.push(exhibitForm);
    }
    else {
      exhibit_forms[efIdx] = exhibitForm;
    }
    consenter.exhibit_forms = exhibit_forms;
  }

  private loadInfoFromDatabase = async () => {
    const { consenterEmail, entity_id, consenter, throwError, mergeExhibitFormIntoConsenterData } = this;
    // Get the consenter
    const consenterInfo = await getConsenterInfo(consenterEmail, false) as ConsenterInfo;
    const { consenter: _consenter, consentStatus } = consenterInfo ?? {};
    const { ACTIVE, EXPIRED } = ConsentStatus;

    // Abort if there is no matching consenter found
    if( ! consenter) {
      throwError(INVALID_RESPONSE_MESSAGES.noSuchConsenter);
    }

    // Abort if the consenter has not yet consented
    if(consentStatus != ACTIVE) {
      if(consentStatus == EXPIRED) {
        throwError(INVALID_RESPONSE_MESSAGES.expiredConsent);
      }
      throwError(INVALID_RESPONSE_MESSAGES.missingConsent);
    }

    this.consenter = _consenter;

    mergeExhibitFormIntoConsenterData();

    // Get the entity
    const daoEntity = DAOFactory.getInstance({ DAOType:"entity", Payload: { entity_id }});
    this.entity = await daoEntity.read() as Entity;

    // Get the authorized individuals of the entity.
    const daoUser = DAOFactory.getInstance({ DAOType:'user', Payload: { entity_id }});
    let _users = await daoUser.read() as User[];
    _users = _users.filter(user => user.active == YN.Yes && (user.role == Roles.RE_AUTH_IND || user.role == Roles.RE_ADMIN));
    this.entityReps.push(..._users);
  }

  /**
   * Save the single exhibit form excerpts of the full exhibit form to the s3 bucket.
   */
  private transferSingleExhibitFormsToBucket = async () => {
    log('Transferring single exhibit forms to bucket...');
    const now = new Date();
    const { EXHIBIT, DISCLOSURE } = ItemType;
    const { SECONDS } = PeriodType;
    const configs = new Configurations();
    const { DELETE_EXHIBIT_FORMS_AFTER: deleteAfter} = ConfigNames;
    const { consenterEmail, consenter, entity, entityReps, affiliates, exhibitForm: { constraint }, bucketItemAddFailures} = this;

    for(let i=0; i<affiliates.length; i++) {
      let metadata = { 
        consenterEmail,
        entityId:entity.entity_id, 
        affiliateEmail:affiliates[i].email,
        constraint,
        savedDate: now
      } as BucketItemMetadataParms;

      try {
        // 1) Save a copy of the single exhibit form pdf to the s3 bucket
        metadata.itemType = EXHIBIT;
        const s3ObjectKeyForExhibitForm = await new BucketExhibitForm(metadata).add(consenter);

        // 2) Save a copy of the disclosure form to the s3 bucket
        metadata.itemType = DISCLOSURE;
        const authorizedIndividuals = entityReps.filter(user => user.active == YN.Yes && (user.role == Roles.RE_AUTH_IND));
        const s3ObjectKeyForDisclosureForm = await new BucketDisclosureForm({
          requestingEntity: entity,
          requestingEntityAuthorizedIndividuals: authorizedIndividuals,
          metadata
        }).add(consenter);

        // 3) Schedule actions against the pdfs that limit how long they survive in the bucket the were just saved to.
        const envVarName = DelayedExecutions.ExhibitFormBucketPurge.targetArnEnvVarName;
        const functionArn = process.env[envVarName];
        if(functionArn) {        
          const lambdaInput = {
            consenterEmail:consenter.email,
            s3ObjectKeyForDisclosureForm,
            s3ObjectKeyForExhibitForm
          } as DisclosureItemsParms;        
          const delayedTestExecution = new DelayedLambdaExecution(functionArn, lambdaInput);
          const waitTime = (await configs.getAppConfig(deleteAfter)).getDuration();
          const timer = EggTimer.getInstanceSetFor(waitTime, SECONDS); 
          await delayedTestExecution.startCountdown(timer, S3ScheduleId, `${S3ScheduleDescription} (${consenter.email})`);
        }
        else {
          console.error(`Cannot schedule ${deleteAfter} ${S3ScheduleDescription}: ${envVarName} variable is missing from the environment!`);
        }
      }
      catch(e) {
        error(e);
        bucketItemAddFailures.push(BucketItemMetadata.toBucketFileKey(metadata));
      }
    }
  }

  
  /**
   * Send the full exhibit form to each authorized individual, RE admin, and any delegates
   */
  private sendFullExhibitFormToEntityStaffAndDelegates = async () => {
    log('Sending full exhibit form to entity staff and delegates...');
    const { consenter, consenterEmail, entity, entityReps, exhibitForm, emailSendFailures } = this;
    const to = [] as string[];
    const cc = [] as string[];
    emailSendFailures.length = 0;
    let sent:boolean = false;
    let _exhibitForm = {...exhibitForm}; // Create a shallow clone
    if( ! _exhibitForm.formType) {
      _exhibitForm.formType = FormTypes.FULL;
    }

    // Sort the reps so that the ASP is encountered first and goes into the "to" array (not the "cc" array).
    entityReps.sort((a, b) => {
      return a.role == Roles.RE_ADMIN ? -1 : 1;
    });

    // Build the to and cc lists
    for(let i=0; i<entityReps.length; i++) {
      // ASPs and AIs
      if(to.length == 0) {
        to.push(entityReps[i].email);
      }
      else {
        cc.push(entityReps[i].email);
      }
      if(entityReps[i].role == Roles.RE_ADMIN) {
        continue;
      }
      if( ( ! entityReps[i].delegate) || ( ! entityReps[i].delegate?.email) ) {
        continue;
      }
      // Delegates
      const delegateEmail = entityReps[i].delegate!.email;
      if( ! cc.includes(delegateEmail)) {
        cc.push(delegateEmail);
      }
    }

    // Send the email to the first entity rep encountered, cc'ing the rest.
    try {
      sent = await new ExhibitEmail({
        consenter,
        entity,
        consentFormUrl: consentFormUrl(consenterEmail),
        data: _exhibitForm,
      } as ExhibitFormParms).send(to, cc);
    }
    catch(e) {
      error(e);
    }
    if( ! sent) {
      emailSendFailures.push(...to);
      emailSendFailures.push(...cc);
    }
  }

  
  /**
   * Send the full exhibit form to the consenting person.
   */
  private sendFullExhibitFormToConsenter = async () => {
    log('Sending full exhibit form to consenter...');
    const { consenter, consenterEmail, exhibitForm, emailSendFailures, entity } = this;
    let sent:boolean = false;
    let _exhibitForm = {...exhibitForm}; // Create a shallow clone
    if( ! _exhibitForm.formType) {
      _exhibitForm.formType = FormTypes.FULL;
    }
    try {
      sent = await new ExhibitEmail({
        consenter,
        entity,
        consentFormUrl: consentFormUrl(consenterEmail),
        data: _exhibitForm,
      } as ExhibitFormParms, { message:'Please find attached a copy of your recently submitted' } as ExhibitEmailOverrides).send([ consenterEmail ]);
    }
    catch(e) {
      error(e);
    }
    if( ! sent) {
      emailSendFailures.push(consenterEmail);
    }
  }

  /**
   * Prune a full exhibit form from the consenters database record
   */
  private pruneExhibitFormFromDatabaseRecord = async () => {
    log('Pruning exhibit form from database record...');
    const { consenter, exhibitForm, entity, bucketAddFailures, emailFailures } = this;
    if(bucketAddFailures()) {
      log(`There were failures related to file storage for exhibit forms for ${consenter.email}. 
        Therefore removal of the corresponding data from the consenters database record is deferred until its natural expiration`);
      return;
    }
    if(emailFailures()) {
      log(`There were email failures related to exhibit form activty for ${consenter.email}. 
        Therefore removal of the corresponding data from the consenters database record is deferred until its natural expiration`);
      return;
    }
    const updatedConsenter = deepClone(consenter) as Consenter;
    const { exhibit_forms:efs=[]} = updatedConsenter;
    // Prune the exhibit form that corresponds to the entity and constraint from the consenters exhibit form listing.
    updatedConsenter.exhibit_forms = efs.filter(ef => {
      return ef.entity_id != entity.entity_id || ef.constraint != exhibitForm.constraint;
    })
    // Update the database record with the pruned exhibit form listing.
    const dao = DAOFactory.getInstance({ DAOType:'consenter', Payload: updatedConsenter});
    // const dao = ConsenterCrud(updatedConsenter);
    await dao.update(consenter);
  }

  /**
   * Return the standard ok response with refreshed consenter info, or an error message if there were email failures
   * @param email 
   * @param includeEntityList 
   * @returns 
   */
  private getResponse = async (email:string, includeEntityList:boolean=true): Promise<LambdaProxyIntegrationResponse> => {
    const { consenter, emailFailures, emailSendFailures,  } = this;
    if(emailFailures()) {
      const msg = 'Internal server error: ' + INVALID_RESPONSE_MESSAGES.emailFailures.replace('INSERT_EMAIL', consenter.email);
      const failedEmails = [...emailSendFailures];
      const payload = { failedEmails };
      return errorResponse(msg, payload);
    }
    return getConsenterResponse(email, true);
  }

  
  public send = async ():Promise<LambdaProxyIntegrationResponse> => {
    const { badResponse, consenterEmail } = this;
    
    try {
      this.validatePayload();

      await this.loadInfoFromDatabase();
      
      await this.transferSingleExhibitFormsToBucket();
      
      await this.sendFullExhibitFormToEntityStaffAndDelegates();

      await this.sendFullExhibitFormToConsenter();

      await this.pruneExhibitFormFromDatabaseRecord();

      return this.getResponse(consenterEmail, true);
    }
    catch(e:any) {
      console.error(e);
      if(badResponse) {
        return badResponse;
      }
      return errorResponse(`Internal server error: ${e.message}`);
    }
  }
}
