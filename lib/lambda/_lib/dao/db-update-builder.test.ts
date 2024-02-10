import { UpdateItemCommandInput } from '@aws-sdk/client-dynamodb';
import { getUpdateCommandBuilderInstance } from './db-update-builder';
import { Invitation, InvitationFields, Roles, User, UserFields } from './entity';

describe('getCommandInputBuilderForUserUpdate', () => {

  it('Should produce the expected command', () => {
    const user = {
      email: 'mickey-mouse@gmail.com',
      entity_id: 'abc123',
      role: Roles.CONSENTING_PERSON,
      sub: 'mm_sub_id',
      fullname: 'Mickey Mouse',
    } as User;

    const isoString = new Date().toISOString();
    const expectedOutput = {
      TableName: 'ett-user',
      Key: {
        [UserFields.email]: { S: user.email },
        [UserFields.entity_id]: { S: user.entity_id }
      },
      ExpressionAttributeNames: {},
      ExpressionAttributeValues: {},
      // NOTE: fields will be set in the same order as they appear in the entity.UserFields
      UpdateExpression: `SET sub = {"S":"mm_sub_id"}, role = {"S":"CONSENTING_PERSON"}, fullname = {"S":"Mickey Mouse"}, update_timestamp = {"S":"${isoString}"}`
    } as UpdateItemCommandInput;

    Date.prototype.toISOString = () => { return isoString; }
    const command:UpdateItemCommandInput = getUpdateCommandBuilderInstance(user, 'ett-user').buildUpdateItem();
    expect(command).toEqual(expectedOutput);
  })
});

describe('getCommandInputBuilderForInvitationUpdate', () => {

  it('Should produce the expected command for invitation creation', () => {    
    const invitation = {
      code: 'abc123',
      email: 'mickey-mouse@gmail.com',
      entity_id: 'abc123',
      role: Roles.CONSENTING_PERSON     
    } as Invitation;

    const isoString = new Date().toISOString();
    const expectedOutput = {
      TableName: 'ett-invitation',
      Key: {
        [InvitationFields.code]: { S: invitation.code }
      },
      ExpressionAttributeNames: {},
      ExpressionAttributeValues: {},
      // NOTE: fields will be set in the same order as they appear in the entity.InvitationFields
      UpdateExpression: `SET role = {"S":"CONSENTING_PERSON"}, email = {"S":"mickey-mouse@gmail.com"}, entity_id = {"S":"abc123"}`
    } as UpdateItemCommandInput;

    Date.prototype.toISOString = () => { return isoString; }
    const command:UpdateItemCommandInput = getUpdateCommandBuilderInstance(invitation, 'ett-invitation').buildUpdateItem();
    expect(command).toEqual(expectedOutput);    
  });
});