export enum Roles {
  SYS_ADMIN = 'SYS_ADMIN',
  RE_ADMIN = 'RE_ADMIN',
  RE_AUTH_IND = 'RE_AUTH_IND',
  CONSENTING_PERSON = 'CONSENTING_PERSON',
  // Just for testing:
  HELLO_WORLD = 'HELLO_WORLD'
};
export enum YN { Yes = 'Y', No = 'N' };

export type Role = Roles.SYS_ADMIN | Roles.RE_ADMIN | Roles.RE_AUTH_IND | Roles.CONSENTING_PERSON | Roles.HELLO_WORLD

export const roleFullName = (role:Role) => {
  switch(role) {
    case Roles.SYS_ADMIN: return 'System Administrator';
    case Roles.RE_ADMIN: return 'Administrative Support Professional';
    case Roles.RE_AUTH_IND: return 'Authorized Individual';
    case Roles.CONSENTING_PERSON: return 'Consenting Individual';
    case Roles.HELLO_WORLD: return 'Hello Worlder'
  }
}

export type Y_or_N = YN.Yes | YN.No

/**************** USER ****************/
export enum UserFields {
  email = 'email',
  entity_id = 'entity_id',
  sub = 'sub',
  role = 'role',
  fullname = 'fullname',
  title = 'title',
  phone_number = 'phone_number',
  delegate = 'delegate',
  create_timestamp = 'create_timestamp',
  update_timestamp = 'update_timestamp',
  registration_signature = 'registration_signature',
  active = 'active'
};
export enum DelegateFields {
  fullname = 'fullname',
  email = 'email',
  title = 'title',
  phone_number = 'phone_number'
};
export type Delegate = {
  fullname: string,
  email: string,
  title?: string,
  phone_number?: string
};
export type User = {
  email: string,
  entity_id: string,
  sub: string,
  role: Role,
  fullname?: string,
  title?: string,
  phone_number?: string,
  delegate?:Delegate,
  create_timestamp?: string,
  update_timestamp?: string,
  registration_signature?: string,
  active?: Y_or_N
};

/**************** CONSENTER ****************/
export enum AffiliateTypes { 
  EMPLOYER_PRIMARY = 'EMPLOYER_PRIMARY', EMPLOYER = 'EMPLOYER', EMPLOYER_PRIOR = 'EMPLOYER_PRIOR', 
  ACADEMIC = 'ACADEMIC', OTHER = 'OTHER' 
};
export type AffiliateType = 
  AffiliateTypes.EMPLOYER_PRIMARY | AffiliateTypes.EMPLOYER | AffiliateTypes.EMPLOYER_PRIOR | 
  AffiliateTypes.ACADEMIC | AffiliateTypes.OTHER;
export type Affiliate = {
  affiliateType: AffiliateType,
  email: string,
  org: string,
  fullname: string,
  title?: string,
  phone_number?: string,
  consenter_signature?: string
};
export enum ExhibitFormFields {
  entity_id = 'entity_id',
  create_timestamp = 'create_timestamp',
  update_timestamp = 'update_timestamp',
  sent_timestamp = 'sent_timestamp',
  affiliates = 'affiliates',
  signature = 'signature'
}
export enum ExhibitFormConstraints { 
  CURRENT = 'current', OTHER = 'other', BOTH = 'both' 
}
export type ExhibitFormConstraint = 
  ExhibitFormConstraints.CURRENT | ExhibitFormConstraints.OTHER | ExhibitFormConstraints.BOTH;
export const enum FormTypes { FULL = 'full', SINGLE = 'single' };
export type FormType = FormTypes.FULL | FormTypes.SINGLE;
export type ExhibitForm = {
  entity_id: string,
  create_timestamp?: string,
  update_timestamp?: string,
  sent_timestamp?: string,
  affiliates?: Affiliate[],
  formType: FormType,
  constraint: ExhibitFormConstraint,
  signature?: string
};
export enum ConsenterFields {
  email = 'email',
  sub = 'sub',
  firstname = 'firstname',
  middlename = 'middlename',
  lastname = 'lastname',
  title = 'title',
  phone_number = 'phone_number',
  create_timestamp = 'create_timestamp',
  update_timestamp = 'update_timestamp',
  consented_timestamp = 'consented_timestamp',
  consent_signature = 'consent_signature',
  registration_signature = 'registration_signature',
  rescinded_timestamp = 'rescinded_timestamp',
  renewed_timestamp = 'renewed_timestamp',
  exhibit_forms = 'exhibit_forms',
  active = 'active'
};
export type Consenter = {
  email: string,
  sub?: string,
  firstname?: string,
  middlename?: string,
  lastname?: string,
  title?: string,
  phone_number?: string,
  create_timestamp?: string,
  registration_signature?: string,
  update_timestamp?: string,
  consented_timestamp: string[],
  consent_signature?: string,
  rescinded_timestamp: string[],
  renewed_timestamp: string[],
  exhibit_forms?: ExhibitForm[],
  active?: Y_or_N
};

/**************** ENTITY ****************/
export enum EntityFields {
  entity_id = 'entity_id',
  entity_name = 'entity_name',
  entity_name_lower = 'entity_name_lower',
  description = 'description',
  create_timestamp = 'create_timestamp',
  update_timestamp = 'update_timestamp',
  registered_timestamp = 'registered_timestamp',
  active = 'active',
};
export type Entity = {
  entity_id: string,
  entity_name: string,
  entity_name_lower: string,
  description: string,
  create_timestamp?: string,
  update_timestamp?: string,
  registered_timestamp?: string,
  active?: Y_or_N
}

/**************** INVITATION ****************/
export enum InvitationFields {
  code = 'code',
  role = 'role',
  email = 'email',
  entity_id = 'entity_id',
  entity_name = 'entity_name',
  sent_timestamp = 'sent_timestamp',
  message_id = 'message_id',
  fullname = 'fullname',
  title = 'title',
  delegate = 'delegate',
  registered_timestamp = 'registered_timestamp',
  retracted_timestamp = 'retracted_timestamp',
  registration_signature = 'registration_signature',
  signup_parameter = 'signup_parameter'
}
export type Invitation = {
  code: string,
  role: Role,
  email: string,
  entity_id: string,
  sent_timestamp: string,
  message_id: string,
  fullname?: string,
  title?: string,
  entity_name?: string,
  delegate?: Delegate,
  registered_timestamp?: string,
  retracted_timestamp?: string,
  registration_signature?: string,
  signup_parameter?: string
}

/**************** CONFIG ****************/
export enum ConfigNames { 
  CONSENT_EXPIRATION = 'consent-expiration',
  ASP_INVITATION_EXPIRE_AFTER = 'asp-invitation-expire-after',
  AUTH_IND_NBR = 'auth-ind-nbr',
  FIRST_REMINDER = 'first-reminder',
  SECOND_REMINDER = 'second-reminder',
  THIRD_REMINDER = 'third-reminder',
  FOURTH_REMINDER = 'fourth-reminder',
  DELETE_EXHIBIT_FORMS_AFTER = 'delete-exhibit-forms-after',
  DELETE_DRAFTS_AFTER = 'delete-drafts-after',
  DELETE_CONSENTER_AFTER = `delete-consenter-after`,
  STALE_ASP_VACANCY = 'stale-asp-vacancy',
  STALE_AI_VACANCY = 'stale-ai-vacancy'
}
export type ConfigName = 
  ConfigNames.CONSENT_EXPIRATION |
  ConfigNames.ASP_INVITATION_EXPIRE_AFTER |
  ConfigNames.AUTH_IND_NBR | 
  ConfigNames.DELETE_DRAFTS_AFTER | 
  ConfigNames.DELETE_EXHIBIT_FORMS_AFTER | 
  ConfigNames.DELETE_CONSENTER_AFTER |
  ConfigNames.FIRST_REMINDER |
  ConfigNames.SECOND_REMINDER |
  ConfigNames.THIRD_REMINDER |
  ConfigNames.FOURTH_REMINDER |
  ConfigNames.STALE_AI_VACANCY |
  ConfigNames.STALE_ASP_VACANCY
export enum ConfigTypes {
  DURATION = 'duration',
  NUMBER = 'number',
  STRING = 'string'
}
export type ConfigType = ConfigTypes.DURATION | ConfigTypes.NUMBER | ConfigTypes.STRING;
export enum ConfigFields {
  name = 'name',
  value = 'value',
  config_type = 'config_type',
  description = 'description',
  update_timestamp = 'update_timestamp'
}
export type Config = {
  name: ConfigName,
  value: string,
  config_type: ConfigType,
  description: string,
  update_timestamp?: string
}

export function Validator() {
  const isRole = (role:string|undefined|null) => {
    if( ! role) return false;
    return Object.values<string>(Roles).includes((role || '').toUpperCase());
  }
  const isYesNo = (yn:string) => {
    return Object.values<string>(YN).includes((yn || '').toUpperCase());
  }
  return { isRole, isYesNo }
}