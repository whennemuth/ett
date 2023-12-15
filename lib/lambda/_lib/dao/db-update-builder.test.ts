import { UpdateItemCommandInput } from '@aws-sdk/client-dynamodb';
import { getUpdateCommandBuilderInstance } from './db-update-builder';
import { Invitation, Roles, User, UserFields } from './entity';

describe('getCommandInputBuilderForUserUpdate', () => {

  it('Should produce the expected command', () => {
    const user = {
      email: 'mickey-mouse@gmail.com',
      entity_name: 'Boston University',
      role: Roles.CONSENTING_PERSON,
      sub: 'mm_sub_id',
      fullname: 'Mickey Mouse',
    } as User;

    const isoString = new Date().toISOString();
    const expectedOutput = {
      TableName: 'ett-user',
      Key: {
        [UserFields.email]: { S: user.email },
        [UserFields.entity_name]: { S: user.entity_name }
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

describe('getCommandInputBuilderForInvitationAppend', () => {
  const invitation = {
    email: 'mickey-mouse@gmail.com',
    entity_name: 'Boston University',
    attempts: [{
      link: 'https://path/and?querystring',
      role: Roles.CONSENTING_PERSON,        
    }]     
  } as Invitation;
  const isoString = new Date().toISOString();
  const expectedOutput = {
    TableName: 'ett-user',
    Key: {
      [UserFields.email]: { S: invitation.email },
      [UserFields.entity_name]: { S: invitation.entity_name }
    },
    ExpressionAttributeNames: {},
    ExpressionAttributeValues: {},
  } as UpdateItemCommandInput;

  it('Should produce the expected command for invitation creation', () => {    
    Date.prototype.toISOString = () => { return isoString; }
    const email = '{"S":"mickey-mouse@gmail.com"}';
    const entity = '{"S":"Boston University"}';
    const role = '{"S":"CONSENTING_PERSON"}';
    const link = '{"S":"https://path/and?querystring"}';
    const sentTs = `{"S":"${isoString}"}`
    const attempt = `{"M":{"link":${link},"role":${role},"sent_timestamp":${sentTs}}}`;
    expectedOutput.UpdateExpression = `SET email = ${email}, entity_name = ${entity}, attempts = list_append(attempts, ${attempt})`;
    const command:UpdateItemCommandInput = getUpdateCommandBuilderInstance(invitation, 'ett-user', 'create').buildUpdateItem();
    expect(command).toEqual(expectedOutput);    
  });

  it('Should produce the expected command for invitation append', () => {
    Date.prototype.toISOString = () => { return isoString; };
    const role = '{"S":"CONSENTING_PERSON"}';
    const link = '{"S":"https://path/and?querystring"}'
    const sentTs = `{"S":"${isoString}"}`;
    const attempt = `{"M":{"link":${link},"role":${role},"sent_timestamp":${sentTs}}}`;
    expectedOutput.UpdateExpression = `SET attempts = list_append(attempts, ${attempt})`;
    const command:UpdateItemCommandInput = getUpdateCommandBuilderInstance(invitation, 'ett-user', 'append').buildUpdateItem();
    expect(command).toEqual(expectedOutput);    
  });

  it('Should produce the expected command for invitation update', () => {
    Date.prototype.toISOString = () => { return isoString; };
    const day = 1000*60*60*24;
    const acceptedDate = new Date(Date.now()+day).toISOString();
    invitation.attempts[0].accepted_timestamp = acceptedDate;
    const accepted = `{"S":"${acceptedDate}"}`;
    const index = 1;
    expectedOutput.UpdateExpression = `SET attempts[${index}].accepted_timestamp = ${accepted}`;
    const command:UpdateItemCommandInput = getUpdateCommandBuilderInstance(invitation, 'ett-user', 'update').buildUpdateItem(index);
    expect(command).toEqual(expectedOutput);
  });
});