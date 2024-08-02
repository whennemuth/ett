import { UpdateItemCommandInput } from "@aws-sdk/client-dynamodb";
import { Invitation, InvitationFields, Roles } from "./entity";
import { invitationUpdate } from "./db-update-builder.invitation";

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
      ExpressionAttributeNames: {
        ['#role']: 'role',
        ['#email']: 'email',
        ['#entity_id']: 'entity_id',
      },
      ExpressionAttributeValues: {
        [':role']: { S: Roles.CONSENTING_PERSON },
        [':email']: { S: 'mickey-mouse@gmail.com' },
        [':entity_id']: { S: 'abc123' },
      },
      // NOTE: fields will be set in the same order as they appear in the entity.InvitationFields
      UpdateExpression: `SET #role = :role, #email = :email, #entity_id = :entity_id`
    } as UpdateItemCommandInput;

    Date.prototype.toISOString = () => { return isoString; }
    const command = invitationUpdate('ett-invitation', invitation).buildUpdateItemCommandInput();
    expect(command).toEqual(expectedOutput);    
  });
});