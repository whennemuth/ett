import { UpdateItemCommandInput } from "@aws-sdk/client-dynamodb";
import { Roles, User, UserFields } from "./entity";
import { userUpdate } from "./db-update-builder.user";

describe('getCommandInputBuilderForUserUpdate', () => {

  it('Should produce the expected command', () => {
    const user = {
      email: 'mickey-mouse@gmail.com',
      entity_id: 'abc123',
      role: Roles.CONSENTING_PERSON,
      sub: 'mm_sub_id',
      fullname: 'Mickey Mouse',
      delegate: {
        email: 'donald-duck@disney.com',
        fullname: 'Donald Duck',
        title: 'Duck of All Trades',
        phone_number: '123-456-7890'
      }
    } as User;

    const isoString = new Date().toISOString();
    const expectedOutput = {
      TableName: 'ett-user',
      Key: {
        [UserFields.email]: { S: user.email },
        [UserFields.entity_id]: { S: user.entity_id }
      },
      ExpressionAttributeNames: {
        ['#sub']: 'sub',
        ['#role']: 'role', 
        ['#fullname']: 'fullname', 
        ['#delegate']: 'delegate',
        ['#update_timestamp']: 'update_timestamp', 
      },
      ExpressionAttributeValues: {
        [':sub']: { S: 'mm_sub_id' },
        [':role']: { S: 'CONSENTING_PERSON' }, 
        [':fullname']: { S: 'Mickey Mouse' }, 
        [':delegate']: { M: {
          'email': { S: 'donald-duck@disney.com' },
          'fullname': { S: 'Donald Duck' },
          'title': { S: 'Duck of All Trades' },
          'phone_number': { S: '123-456-7890' }
        } },
        [':update_timestamp']: { S: isoString }, 
      },
      // NOTE: fields will be set in the same order as they appear in the entity.UserFields
      UpdateExpression: 'SET #sub = :sub, #role = :role, #fullname = :fullname, #delegate = :delegate, #update_timestamp = :update_timestamp'
    } as UpdateItemCommandInput;

    Date.prototype.toISOString = () => { return isoString; }
    const command = userUpdate('ett-user', user).buildUpdateItemCommandInput();
    expect(command).toEqual(expectedOutput);
  })
});