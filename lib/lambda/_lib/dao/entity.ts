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
  create_timestamp = 'create_timestamp',
  update_timestamp = 'update_timestamp',
  active = 'active'
};
export type User = {
  email: string,
  entity_id: string,
  sub: string,
  role: Role,
  fullname?: string,
  title?: string,
  phone_number?: string,
  create_timestamp?: string,
  update_timestamp?: string,
  active?: Y_or_N
};

/**************** CONSENTER ****************/
export const enum AffiliateTypes { EMPLOYER = 'EMPLOYER', ACADEMIC = 'ACADEMIC', OTHER = 'OTHER' };
export type AffiliateType = AffiliateTypes.EMPLOYER | AffiliateTypes.ACADEMIC | AffiliateTypes.OTHER;
export type Affiliate = {
  affiliateType: AffiliateType,
  email: string,
  org: string,
  fullname: string,
  title?: string,
  phone_number?: string
};
export enum ExhibitFormFields {
  entity_id = 'entity_id',
  create_timestamp = 'create_timestamp',
  update_timestamp = 'update_timestamp',
  sent_timestamp = 'sent_timestamp',
  affiliates = 'affiliates'
}
export type ExhibitForm = {
  entity_id: string,
  create_timestamp?: string,
  update_timestamp?: string,
  sent_timestamp?: string,
  affiliates?: Affiliate[]
};
export enum ConsenterFields {
  email = 'email',
  sub = 'sub',
  fullname = 'fullname',
  title = 'title',
  phone_number = 'phone_number',
  create_timestamp = 'create_timestamp',
  update_timestamp = 'update_timestamp',
  consented_timestamp = 'consented_timestamp',
  rescinded_timestamp = 'rescinded_timestamp',
  renewed_timestamp = 'renewed_timestamp',
  exhibit_forms = 'exhibit_forms',
  active = 'active'
};
export type Consenter = {
  email: string,
  sub?: string,
  fullname?: string,
  title?: string,
  phone_number?: string,
  create_timestamp?: string,
  update_timestamp?: string,
  consented_timestamp?: string,
  rescinded_timestamp?: string,
  renewed_timestamp?: string,
  exhibit_forms?: ExhibitForm[],
  active?: Y_or_N
};

/**************** ENTITY ****************/
export enum EntityFields {
  entity_id = 'entity_id',
  entity_name = 'entity_name',
  description = 'description',
  create_timestamp = 'create_timestamp',
  update_timestamp = 'update_timestamp',
  active = 'active'
};
export type Entity = {
  entity_id: string,
  entity_name: string,
  description: string,
  create_timestamp?: string,
  update_timestamp?: string,
  active?: Y_or_N
}

/**************** INVITATION ****************/
export enum InvitationFields {
  code = 'code',
  role = 'role',
  email = 'email',
  entity_id = 'entity_id',
  sent_timestamp = 'sent_timestamp',
  message_id = 'message_id',
  fullname = 'fullname',
  title = 'title',
  acknowledged_timestamp = 'acknowledged_timestamp',
  registered_timestamp = 'registered_timestamp',
  retracted_timestamp = 'retracted_timestamp',
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
  acknowledged_timestamp?: string,
  registered_timestamp?: string,
  retracted_timestamp?: string,
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