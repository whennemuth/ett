import { mockClient } from 'aws-sdk-client-mock'
import 'aws-sdk-client-mock-jest';
import { DAOFactory, DAOInvitation } from './dao';
import { Builder, getUpdateCommandBuilderInstance } from './db-update-builder';
import { DeleteItemCommand, DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, UpdateItemCommand, UpdateItemCommandInput } from '@aws-sdk/client-dynamodb'
import { InvitationFields, Invitation, Roles, InvitationAttemptFields, InvitationAttempt, Role } from './entity';
import { InitCommand } from 'aws-cdk-lib/aws-ec2';

const action = process.env.ACTION_TO_TEST?.toLocaleLowerCase() || '';

const ignoreMe = (atn: string) => {
  return action.length > 0 && action != atn;
}

/* -------------------------------------------------------------------------------- */
/*                                   MOCKS                                          */
/* -------------------------------------------------------------------------------- */

const dbMockClient = mockClient(DynamoDBClient);

const getSingleAttemptMockInvitation = (withSentDate?:boolean): any => {
  const mockInvitation = {
    [InvitationFields.email]: { S: 'somebody@gmail.com' },
    [InvitationFields.entity_name]: { S: 'Boston University' },
    [InvitationFields.attempts]: { L: [
      { M: 
        {
          [InvitationAttemptFields.role]: { S: Roles.GATEKEEPER },
          [InvitationAttemptFields.link]: { S: 'https://path/and?querystring' },
        }
      }
    ]}
  } as any;
  if(withSentDate) {
    mockInvitation[InvitationFields.attempts].L[0].M[InvitationAttemptFields.sent_timestamp] = { S: new Date().toISOString() };
  }
  return mockInvitation;
}

type MockDAOInstanceParms = {
  updateRole: 'same'|'different',
  updateSent: 'same'|'different',
  existingAttempts: (InvitationAttempt|'default')[]
};
const getMockedDAOInstanceForUpdates = (parms:MockDAOInstanceParms):DAOInvitation => {
  const { existingAttempts, updateRole, updateSent } = parms;
  const singleInvitation = getSingleAttemptMockInvitation(true);

  let hasDefault = false;
  existingAttempts.forEach((attempt) => {
    if(attempt == 'default') {
      hasDefault = true;
    }
    else {
      var atpt = attempt as unknown as InvitationAttempt;
      var m = {
        [InvitationAttemptFields.role]: { S: atpt.role },
        [InvitationAttemptFields.link]: { S: atpt.link },
      } as any;
      if(atpt.sent_timestamp) m[InvitationAttemptFields.sent_timestamp] = { S: atpt.sent_timestamp };
      singleInvitation[InvitationFields.attempts].L.push({ M: m });    
    }
  });
  singleInvitation[InvitationFields.attempts].L.reverse();
  if( ! hasDefault) {
    singleInvitation[InvitationFields.attempts].L.pop(0)
  }

  // The default attempt will be the one that will potentially "match", and will be the last found in the attempts list.
  const idx = singleInvitation[InvitationFields.attempts].L.length - 1;
  const defaultAttempt = singleInvitation[InvitationFields.attempts].L[idx].M
  const existingRole = defaultAttempt[InvitationAttemptFields.role].S;
  const existingLink = defaultAttempt[InvitationAttemptFields.link].S;
  const existingSentDate = defaultAttempt[InvitationAttemptFields.sent_timestamp].S;

  // By default, the "new" attempt will match the default attempt in the attempts list of the database output.
  let newRole = existingRole;
  let newLink = existingLink;
  let newSent = existingSentDate;

  // Make the "new" attempt not match the default attempt in the attempts list of the database output.
  if(updateSent === 'different') {
    const DAY = 1000 * 60 *60 * 24;
    newSent = new Date(Date.parse(newSent) + DAY).toISOString();
  }
  if(updateRole === 'different') {
    newRole = newRole == Roles.GATEKEEPER ? Roles.RE_ADMIN : Roles.GATEKEEPER;
  }

  // Mock the database read output for invitation lookup with invitation mock.
  dbMockClient.on(GetItemCommand).resolves({
    ConsumedCapacity: {},
    Item: singleInvitation
  });

  // Configure the update parameters
  const dao = DAOFactory.getInstance({
    DAOType: 'invitation', Payload: {
      [InvitationFields.email]: 'somebody@gmail.com',
      [InvitationFields.entity_name]: 'Boston University',
      [InvitationFields.attempts]: [{
        [InvitationAttemptFields.role]: newRole,
        [InvitationAttemptFields.link]: newLink,
        [InvitationAttemptFields.sent_timestamp]: newSent
      } as unknown ]
    }
  }) as DAOInvitation;
  return dao;
};

/* -------------------------------------------------------------------------------- */
/*                                  UNIT TESTS                                      */
/* -------------------------------------------------------------------------------- */

const testPut = () => {
  describe('Dao invitation create', () => {
    const role = 'bogus';
    const email = 'somebody@gmail.com';
    const entity = 'Boston University';

    it('Should error if invalid role specified', () => {
      expect(() => {
        const Payload = {
            [InvitationFields.email]: email,
            [InvitationFields.entity_name]: entity,
            [InvitationFields.attempts]: [{
              [InvitationAttemptFields.role]: role,
              [InvitationAttemptFields.link]: 'https://path/and/querystring'       
          } as unknown ]
        } as Invitation;
        const dao = DAOFactory.getInstance({ DAOType: 'invitation', Payload });
      }).toThrow(/^Invitation crud error: Invalid role specified in/);      
    });

    it('Should error attempting to create an invitation without a role specified', async() => {
      const dao = DAOFactory.getInstance({
        DAOType: 'invitation', Payload: {
          [InvitationFields.email]: email,
          [InvitationFields.entity_name]: entity,
          [InvitationFields.attempts]: [{
            [InvitationAttemptFields.link]: 'https://path/and/querystring',        
          } as InvitationAttempt ]
      } as Invitation });
      expect(async () => {
        await dao.create();
      }).rejects.toThrow(/^Invitation create error: Missing role in/);
    });

    it('Should error attempting to create an invitation without a link specified', async() => {
      const dao = DAOFactory.getInstance({
        DAOType: 'invitation', Payload: {
          [InvitationFields.email]: 'somebody@gmail.com',
          [InvitationFields.entity_name]: 'Boston University',
          [InvitationFields.attempts]: [{
            [InvitationAttemptFields.role]: Roles.RE_ADMIN,
          } as InvitationAttempt ]                
      }});
      expect(async () => {
        await dao.create();
      }).rejects.toThrow(/^Invitation create error: Missing link in/);
    });
  });
}

const testRead = () => {
  describe('Dao invitation read', () => {

    it('Should return an array if just email is specified', async () => {
      dbMockClient.on(QueryCommand).resolves({
        ConsumedCapacity: {},
        Items: [ getSingleAttemptMockInvitation() ]
      });
      const dao = DAOFactory.getInstance({
        DAOType: 'invitation', Payload: {
          [InvitationFields.email]: 'somebody@gmail.com',
        }
      });
      const output = await dao.read();
      expect(dbMockClient).toHaveReceivedCommandTimes(QueryCommand, 1);
      expect(output).toBeInstanceOf(Array);
      const invitation:Invitation[] = output as Invitation[];
      expect(invitation[0]).toHaveProperty(InvitationFields.email);
      expect(invitation[0][InvitationFields.email]).toEqual('somebody@gmail.com');
    })
    
    it('Should return an object if email and entity are specified', async () => {
      dbMockClient.on(GetItemCommand).resolves({
        ConsumedCapacity: {},
        Item: getSingleAttemptMockInvitation()
      });
      const dao = DAOFactory.getInstance({
        DAOType: 'invitation', Payload: {
          [InvitationFields.email]: 'somebody@gmail.com',
          [InvitationFields.entity_name]: 'Boston University',
        }
      });
      const output = await dao.read();
      expect(dbMockClient).toHaveReceivedCommandTimes(GetItemCommand, 1);
      expect(output).toHaveProperty(InvitationFields.email);
      const invitation:Invitation = output as Invitation;
      expect(invitation[InvitationFields.email]).toEqual('somebody@gmail.com');
    });
  });
}

let lastUpdateType:'update'|'append';
jest.mock('./db-update-builder.ts', () => {
  return {
    __esModule: true,
    getUpdateCommandBuilderInstance: (info:Invitation, TableName:string, task?:'create'|'update'|'append'): Builder => {
      return {
        buildUpdateItem: (index?:number): UpdateItemCommandInput => {
          lastUpdateType = index == undefined ? 'append' : 'update';
          return {} as UpdateItemCommandInput;
        }
      }
    }
  }
});

const testUpdate = () => {
  describe('Dao invitation update', () => {

    it('Should error if either email or entity name are missing (no bulk updates)', async() => {
      expect(async() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'invitation', Payload: {
            [InvitationFields.email]: 'somebody@gmail.com',
        }});
        await dao.update();
      }).rejects.toThrow(/^Invitation update error: Missing entity_name in/);

      expect(async() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'invitation', Payload: {
            [InvitationFields.entity_name]: 'Boston University',
        }});
        await dao.update();
      }).rejects.toThrow(/^Invitation crud error: Missing email in/);
    });

    it('Should error if no invitation attempts provided', async() => {
      expect(async() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'invitation', Payload: {
            [InvitationFields.email]: 'somebody@gmail.com',
            [InvitationFields.entity_name]: 'Boston University',
        }});
        await dao.update();
      }).rejects.toThrow(/^Invitation update error: No fields to update for/);

      expect(async() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'invitation', Payload: {
            [InvitationFields.email]: 'somebody@gmail.com',
            [InvitationFields.entity_name]: 'Boston University',
            [InvitationFields.attempts]: []
        }});
        await dao.update();
      }).rejects.toThrow(/^Invitation update error: No fields to update for/);
    });

    it('Should update if match for role and sent_timestamp found in invitation with one attempt', async () => {
      const dao = getMockedDAOInstanceForUpdates({
        existingAttempts: ['default'],
        updateRole: 'same',
        updateSent: 'same'
      });
      await dao.update();
      expect(lastUpdateType).toEqual('update');      
    });

    it('Should update if match for role and sent_timestamp found in invitation with multiple attempts', async () => {
      const dao = getMockedDAOInstanceForUpdates({
        existingAttempts: [
          'default', 
          { role: Roles.GATEKEEPER, link: 'https://path/and?querystring' }, 
          { role: Roles.RE_AUTH_IND, link: 'https://path/and?querystring'}
        ],
        updateRole: 'same',
        updateSent: 'same'
      });
      await dao.update();
      expect(lastUpdateType).toEqual('update');
    });

    it('Should append if match for role found, but not sent_timestamp', async () => {
      const dao = getMockedDAOInstanceForUpdates({
        existingAttempts: ['default'],
        updateRole: 'same',
        updateSent: 'different'
      });
      await dao.update();
      expect(lastUpdateType).toEqual('append');      
    });

    it('Should append if no match for either role or sent_timestamp found', async () => {      
      const dao = getMockedDAOInstanceForUpdates({
        existingAttempts: ['default'],
        updateRole: 'different',
        updateSent: 'different'
      });
      await dao.update();
      expect(lastUpdateType).toEqual('append');      
    });
  });
}

// const testDelete = () => {
//   describe('Dao invitation delete', () => {

//   });
// }


// if( ! ignoreMe('create')) {
//   testPut();
// }

// if( ! ignoreMe('read')) {
//   testRead();
// }

if( ! ignoreMe('update')) {
  testUpdate();
}

// if( ! ignoreMe('delete')) {
//   testDelete();
// }