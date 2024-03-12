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
  consented_timestamp = 'consented_timestamp',
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
  consented_timestamp?: string,
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