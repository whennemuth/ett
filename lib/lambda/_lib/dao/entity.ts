export enum Roles {
  GATEKEEPER = 'GATEKEEPER',
  RE_ADMIN = 'RE_ADMIN',
  RE_AUTH_IND = 'RE_AUTH_IND',
  CONSENTING_PERSON = 'CONSENTING_PERSON',
  // Just for testing:
  HELLO_WORLD = 'HELLO_WORLD'
};
export enum YN { Yes = 'Y', No = 'N' };

export type Role = Roles.GATEKEEPER | Roles.RE_ADMIN | Roles.RE_AUTH_IND | Roles.CONSENTING_PERSON | Roles.HELLO_WORLD

export type Y_or_N = YN.Yes | YN.No

/**
 * RESUME NEXT
 * 
 * 1) Gatekeeper can be signed up for and dynamodb entry created, but cannot seem to signin on index.htm - fix this.
 * 
 * 2) Add a presignup lambda trigger for cognito that looks in the invitations table for the email of the
 * signing up user and compare the role found there to the new role determined by lookupRole function (borrow
 * this from PostSignup.ts). If the user is found in the invitations table and the role matches, only then 
 * let the signup process continue, otherwise reject it there. This should be the flow for all "non-public"
 * signups (re-admin, auth-ind)
 * 
 * 3) Deploy the current changes and see if public user signup triggers automatic dynamodb user creation.
 * 
 */
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
  role = 'role',
  link = 'link',
  create_timestamp = 'create_timestamp',
  accepted_timestamp = 'update_timestamp',
}
export type Invitation = {
  email: string,
  entity_name: string,
  role: Role,
  link: string,
  create_timestamp?: string,
  accepted_timestamp?: string,
}

export function Validator() {
  const isRole = (role:string) => {
    return Object.values<string>(Roles).includes((role || '').toUpperCase());
  }
  const isYesNo = (yn:string) => {
    return Object.values<string>(YN).includes((yn || '').toUpperCase());
  }
  return { isRole, isYesNo }
}