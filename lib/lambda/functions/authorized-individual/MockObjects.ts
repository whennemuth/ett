import { Entity, Invitation, Roles, User, YN } from "../../_lib/dao/entity";

const entity_id = 'mock_entity_id';
const dte = new Date().toISOString();
const create_timestamp = dte; 
const update_timestamp = dte;

// Bugs
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
  title: 'Rabbit',
  delegate: {
    email: 'delegate1@anytown-university.com',
    fullname: 'Delegate One',
    phone_number: '+6173335555',
    title: 'Bugs Bunnys Delegate'
  }
} as User;
export const bugbunny_invitation = {
  code: 'abc123',
  entity_id,
  message_id: '0cea3257-38fd-4c24-a12f-fd731f19cae6',
  role: Roles.RE_ADMIN,
  sent_timestamp: dte,
  email: 'bugsbunny@warnerbros.com',                      
} as Invitation;

// Daffy
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
export const daffyduck_invitation = {
  code: 'def456',
  entity_id,
  message_id: '0cea3257-38fd-4c24-a12f-fd731f19cae7',
  role: Roles.RE_AUTH_IND,
  sent_timestamp: dte,
  email: 'daffyduck@warnerbros.com',
} as Invitation;

// Yosemite Sam
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
export const yosemitesam_invitation = {
  code: 'ghi789',
  entity_id,
  message_id: '0cea3257-38fd-4c24-a12f-fd731f19cae8',
  role: Roles.RE_AUTH_IND,
  sent_timestamp: dte,
  email: 'yosemitesam@warnerbros.com',
} as Invitation;

// Albert Einstein
export const alberteinstein = {
  email: 'alberteinstein@princeton.edu',
  entity_id,
  role: Roles.RE_AUTH_IND,
  active: YN.Yes,
  create_timestamp,
  update_timestamp,
  fullname: 'Albert Einstein',
  sub: 'alberteinstein_cognito_sub',
  phone_number: '+1234567890',
  title: 'Professor'
} as User;

// Abraham Lincoln
export const abrahamlincoln = {
  email: 'abrahamlincoln@history.com',
  entity_id,
  role: Roles.RE_AUTH_IND,
  active: YN.Yes,
  create_timestamp,
  update_timestamp,
  fullname: 'Abraham Lincoln',
  sub: 'abrahamlincoln_cognito_sub',
  phone_number: '+1234567891',
  title: 'President'
} as User;

// Elvis Presley
export const elvispresley = {
  email: 'elvispresley@graceland.com',
  entity_id,
  role: Roles.RE_AUTH_IND,
  active: YN.Yes,
  create_timestamp,
  update_timestamp,
  fullname: 'Elvis Presley',
  sub: 'elvispresley_cognito_sub',
  phone_number: '+1234567892',
  title: 'Entertainer'
} as User;

// Bing Crosby
export const bingcrosby = {
  email: 'bingcrosby@hollywood.com',
  entity_id,
  role: Roles.RE_AUTH_IND,
  active: YN.Yes,
  create_timestamp,
  update_timestamp,
  fullname: 'Bing Crosby',
  sub: 'bingcrosby_cognito_sub',
  phone_number: '+1234567893',
  title: 'Singer',
  delegate: {
    email: 'delegate2@anytown-university.com',
    fullname: 'Delegate One',
    phone_number: '+6174446666',
    title: 'Bing Crosbys Delegate'
  }
} as User;

export const entity = {
  entity_id, 
  entity_name: 'Boston University', 
  description: 'Where I work', 
  active: YN.Yes, 
  create_timestamp, 
  update_timestamp
} as Entity;