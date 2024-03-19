import { Entity, Invitation, Roles, User, YN } from "../../_lib/dao/entity";

const entity_id = 'mock_entity_id';
const dte = new Date().toISOString();
const create_timestamp = dte; 
const update_timestamp = dte;

export const tables = {
  user: 'ett-users',
  invitation: 'ett-invitation',
  entity: 'ett-entities'
};

export const bugsbunny = {
  email: 'bugsbunny@warnerbros.com',
  entity_id,
  role: Roles.RE_ADMIN,
  sub: 'bugsbunny_cognito_sub',
  active: YN.Yes,
  create_timestamp,
  update_timestamp,
  fullname: 'Bug Bunny',
  phone_number: '+6172224444',
  title: 'Rabbit'
} as User;

export const daffyduck = {
  email: 'daffyduck@warnerbros.com',
  entity_id,
  role: Roles.RE_AUTH_IND,
  active: YN.Yes,
  create_timestamp,
  update_timestamp,
  fullname: 'Daffy Duck',
  sub: 'daffyduck_cognito_sub',
  phone_number: '+7813335555',
  title: 'Duck'
} as User;

export const yosemitesam = {
  email: 'yosemitesam@warnerbros.com',
  entity_id,
  role: Roles.RE_AUTH_IND,
  active: YN.Yes,
  create_timestamp,
  update_timestamp,
  fullname: 'Yosemite Sam',
  sub: 'yosemitesam_cognito_sub',
  phone_number: '+7814446666',
  title: 'Cowboy'
} as User;

export const bugbunny_invitation = {
  code: 'abc123',
  entity_id,
  message_id: '0cea3257-38fd-4c24-a12f-fd731f19cae6',
  role: Roles.RE_ADMIN,
  sent_timestamp: dte,
  email: 'bugsbunny@warnerbros.com',                      
} as Invitation;

export const daffyduck_invitation = {
  code: 'def456',
  entity_id,
  message_id: '0cea3257-38fd-4c24-a12f-fd731f19cae7',
  role: Roles.RE_AUTH_IND,
  sent_timestamp: dte,
  email: 'daffyduck@warnerbros.com',
} as Invitation;

export const yosemitesam_invitation = {
  code: 'ghi789',
  entity_id,
  message_id: '0cea3257-38fd-4c24-a12f-fd731f19cae8',
  role: Roles.RE_AUTH_IND,
  sent_timestamp: dte,
  email: 'yosemitesam@warnerbros.com',
} as Invitation;

export const entity = {
  entity_id, 
  entity_name: 'Boston University', 
  description: 'Where I work', 
  active: YN.Yes, 
  create_timestamp, 
  update_timestamp
} as Entity;