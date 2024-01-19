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
  entity_name = 'entity_name',
  sub = 'sub',
  role = 'role',
  fullname = 'fullname',
  create_timestamp = 'create_timestamp',
  update_timestamp = 'update_timestamp',
  active = 'active'
};
export type User = {
  email: string,
  entity_name: string,
  sub: string,
  role?: Role,
  fullname?: string,
  create_timestamp?: string,
  update_timestamp?: string,
  active?: Y_or_N
};

export enum EntityFields {
  entity_name = 'entity_name',
  description = 'description',
  create_timestamp = 'create_timestamp',
  update_timestamp = 'update_timestamp',
  active = 'active'
};
export type Entity = {
  entity_name: string,
  description: string,
  create_timestamp?: string,
  update_timestamp?: string,
  active?: Y_or_N
}

export enum InvitationFields {
  email = 'email',
  entity_name = 'entity_name',
  attempts = 'attempts',
}
export enum InvitationAttemptFields {
  role = 'role',
  link = 'link',
  sent_timestamp = 'sent_timestamp',
  accepted_timestamp = 'update_timestamp',
  retracted_timestamp = 'retracted_timestamp',
}
export type InvitationAttempt = {
  role: Role,
  link: string,
  sent_timestamp?: string,
  accepted_timestamp?: string,
  retracted_timestamp?: string,
}
export type Invitation = {
  email: string,
  entity_name: string,
  attempts: InvitationAttempt[]
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