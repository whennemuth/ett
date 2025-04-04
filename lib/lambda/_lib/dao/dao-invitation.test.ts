import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DAOFactory, DAOInvitation } from './dao';
import { DeleteItemCommand, DynamoDBClient, GetItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { InvitationFields, Invitation, Roles } from './entity';

const dbMockClient = mockClient(DynamoDBClient);
const code = 'abc123';
const email = 'somebody@gmail.com';
const entityId = '0cea3257-38fd-4c24-a12f-fd731f19cae6';
const dynamodbItem = {
  [InvitationFields.code]: { S: code },
  [InvitationFields.email]: { S: email },
  [InvitationFields.entity_id]: { S: entityId },
  [InvitationFields.role]: { S: Roles.SYS_ADMIN },
  [InvitationFields.sent_timestamp]:  { S: new Date().toISOString() }
};

const testPut = () => {
  describe('Dao invitation create', () => {
    const role = 'bogus';

    it('Should error attempting to create an invitation without a role specified', async() => {
      const dao = DAOFactory.getInstance({
        DAOType: 'invitation', Payload: {
          [InvitationFields.entity_id]: entityId
      } as Invitation });
      expect(async () => {
        await dao.create();
      }).rejects.toThrow(/^Invitation create error: Missing role in/);
    });

    it('Should error if invalid role specified', () => {
      expect(() => {
        const Payload = {
            [InvitationFields.entity_id]: entityId,
            [InvitationFields.role] : role
        };
        const dao = DAOFactory.getInstance({ DAOType: 'invitation', Payload });
      }).toThrow(/^Invitation crud error: Invalid role specified in/);      
    });

    it('Should auto-generate an invitation code if none is provided', async () => {
      const dao = DAOFactory.getInstance({
        DAOType: 'invitation', Payload: {
          [InvitationFields.role]: Roles.RE_ADMIN,
          [InvitationFields.entity_id]: entityId                
      }}) as DAOInvitation;
      await dao.create();
      expect(dao.code()).toBeDefined();
    });

    it('Should use the invitation code that is provided', async () => {
      const dao = DAOFactory.getInstance({
        DAOType: 'invitation', Payload: {
          [InvitationFields.code]: code,
          [InvitationFields.role]: Roles.RE_ADMIN,
          [InvitationFields.entity_id]: entityId                
      }}) as DAOInvitation;
      await dao.create();
      expect(dao.code()).toEqual(code);
    });
  });
}

const testRead = () => {
  describe('Dao invitation read', () => {
  
    it('Should error if code, email, and entity_id are missing', async() => {
      expect(async () => {
        const dao = DAOFactory.getInstance({
          DAOType: 'invitation', Payload: {
            [InvitationFields.role]: Roles.RE_ADMIN
        }});
        await dao.read();
      }).rejects.toThrow(/^Invitation read error: Missing code in/);
    });

    it('Should return null if a non-existing code is specified', async () => {
      const dao = DAOFactory.getInstance({
        DAOType: 'invitation', Payload: {
          [InvitationFields.code]: 'bogus'
        }
      });
      dbMockClient.on(GetItemCommand).resolves({ ConsumedCapacity: {}});
      const output = await dao.read();
      expect(dbMockClient).toHaveReceivedCommandTimes(GetItemCommand, 1);
      expect(output).toBeNull();
    });

    it('Should return object of type Invitation if an existing code is specified', async () => {
     const dao = DAOFactory.getInstance({
        DAOType: 'invitation', Payload: {
          [InvitationFields.code]: code,
        }
      });
      dbMockClient.resetHistory();
      dbMockClient.on(GetItemCommand).resolves({ ConsumedCapacity: {}, Item: dynamodbItem });
      const output = await dao.read();
      expect(dbMockClient).toHaveReceivedCommandTimes(GetItemCommand, 1);
      expect(output).toHaveProperty(InvitationFields.email);
      const invitation = output as Invitation;
      expect(invitation.entity_id).toEqual(entityId);
    });

    it('Should return an array of type Invitation if email was provided instead of code', async() => {
      dbMockClient.resetHistory();
      dbMockClient.on(QueryCommand).resolves({
        ConsumedCapacity: {},
        Count: 1, ScannedCount: 1,
        Items: [ dynamodbItem ]
      });
      const dao = DAOFactory.getInstance({
        DAOType: 'invitation', Payload: {
          [InvitationFields.email]: email,
      }});
      const output = await dao.read();
      expect(dbMockClient).toHaveReceivedCommandTimes(QueryCommand, 1);
      expect(output).toBeInstanceOf(Array);
      const invitations = output as Invitation[];
      expect(invitations[0]).toHaveProperty(InvitationFields.email);
      expect(invitations[0][InvitationFields.email]).toEqual(email);
    });

    it('Should return an array of type Invitation if entity_id was provided instead of code', async() => {
      dbMockClient.resetHistory();
      dbMockClient.on(QueryCommand).resolves({
        ConsumedCapacity: {},
        Count: 1, ScannedCount: 1,
        Items: [ dynamodbItem ]
      });
      const dao = DAOFactory.getInstance({
        DAOType: 'invitation', Payload: {
          [InvitationFields.entity_id]: entityId,
      }});
      const output = await dao.read();
      expect(dbMockClient).toHaveReceivedCommandTimes(QueryCommand, 1);
      expect(output).toBeInstanceOf(Array);
      const invitations = output as Invitation[];
      expect(invitations[0]).toHaveProperty(InvitationFields.email);
      expect(invitations[0][InvitationFields.email]).toEqual(email);
    });
  });
}

const testUpdate = () => {
  describe('Dao invitation update', () => {

    it('Should error if code is missing', async () => {
      expect(async() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'invitation', Payload: {
            [InvitationFields.entity_id]: entityId,
        }});
        await dao.update();
      }).rejects.toThrow(/^Invitation update error: Missing code in/);
    });

    it('Should error if code is the only field provided', async() => {
      expect(async() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'invitation', Payload: {
            [InvitationFields.code]: code,
        }});
        await dao.update();
      }).rejects.toThrow(/^User update error: No fields to update for/);
    });

    it('Should update if matching code found', async () => {
      dbMockClient.on(UpdateItemCommand).resolves({
        Attributes: dynamodbItem
      });
      const dao = DAOFactory.getInstance({
        DAOType: 'invitation', Payload: {
          [InvitationFields.code]: code,
          [InvitationFields.entity_id]: entityId,
          [InvitationFields.role] : Roles.SYS_ADMIN
      }});
      await dao.update();
      expect(dbMockClient).toHaveReceivedCommandTimes(UpdateItemCommand, 1);
    });
  });
}

const testDelete = () => {
  describe('Dao invitation delete', () => {
    it('Should NOT error if code is missing', async () => {
      const dao = DAOFactory.getInstance({
        DAOType: 'invitation', Payload: {
          [InvitationFields.email]: email,
          [InvitationFields.entity_id]: entityId,
      }});
      await dao.Delete();
      expect(dbMockClient).toHaveReceivedCommandTimes(DeleteItemCommand, 1);
    });
  });
}


testPut();

testRead();

testUpdate();

testDelete();
