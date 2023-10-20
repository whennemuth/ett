export enum Roles {
  GATEKEEPER = 'GATEKEEPER',
  RE_ADMIN = 'RE_ADMIN',
  RE_AUTH_IND = 'RE_AUTH_IND',
  CONSENTING_PERSON = 'CONSENTING_PERSON'
};
export enum YN { Yes = 'Y', No = 'N' };

export type Role = Roles.GATEKEEPER | Roles.RE_ADMIN | Roles.RE_AUTH_IND | Roles.CONSENTING_PERSON

export type Y_or_N = YN.Yes | YN.No

export enum UserFields {
  email = 'email',
  entity_name = 'entity_name',
  role = 'role',
  fullname = 'fullname',
  create_timestamp = 'create_timestamp',
  update_timestamp = 'update_timestamp',
  active = 'active'
}
export interface User {
  email: string;
  entity_name: string,
  role?: Role,
  fullname?: string
  create_timestamp?: string
  update_timestamp?: string
  active?: Y_or_N
}