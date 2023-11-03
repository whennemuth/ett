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
 * RESUME NEXT:
 * 1) Add a sub field to UserFields and User. Make it required to start with so it shows up everywhere it needs
 * to be addressed where the linter complains, then think about making it optional - that is, is there a 
 * scenario in which a user gets created in dynamodb before that user confirms their signup in cognito? (see below).
 * 
 * 2) Deploy the current changes and see if public user signup triggers automatic dynamodb user creation.
 * 
 * 3) For admins and auth individuals who get invited and do not confirm their signup, but simply reset the passwords,
 * Is there an lambda event trigger for that? If so, use the same approach as with post signup for getting users
 * into dynamodb. If not, then part of the invitation process would have to include adding the user to dynamodb
 * BEFORE they click the invitation link in an email and proceed on to reset their password. In the latter scenario,
 * what would be missing from the user dynamodb entry would be the sub value, so we still need some kind of cognito
 * originated lambda trigger to get that sub value set.
 * 
 * 4) Think about a separate dynamodb table for entities. A gatekeeper would maintain this list.
 * The gatekeeper would then invite admins to their specific registered entity.
 * When all other users signup or perform invitation password resets, the first thing they would need to do when
 * they get into the app is to associate themselves with an entity from a picklist the gatekeeper maintains.
 * Needs to be discussed with the team.
 * 
 */
export enum UserFields {
  email = 'email',
  entity_name = 'entity_name',
  role = 'role',
  fullname = 'fullname',
  create_timestamp = 'create_timestamp',
  update_timestamp = 'update_timestamp',
  active = 'active'
}
export type User = {
  email: string,
  entity_name: string,
  role?: Role,
  fullname?: string,
  create_timestamp?: string,
  update_timestamp?: string,
  active?: Y_or_N
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