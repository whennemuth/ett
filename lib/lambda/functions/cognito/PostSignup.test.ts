import 'aws-sdk-client-mock-jest';
import { DAOInvitation, DAOUser } from '../../_lib/dao/dao';
import { Invitation, Role, Roles, User } from '../../_lib/dao/entity';
import { handler } from './PostSignup';
import { ENTITY_WAITING_ROOM } from '../../_lib/dao/dao-entity';

// ---------------------- EVENT DETAILS ----------------------
const clientId = '6s4a2ilv9e5solo78f4d75hlp8';
const userPoolId = 'us-east-2_J9AbymKIz'
let create_user_attempts = 0;
let role_lookup_attempts = 0;
let invitation_lookup_attempts = 0;
let invitationRole:Role = Roles.RE_ADMIN;
let invitationScenario = 'match';

/**
 * Define a partial mock for the cognito Lookup.ts module
 */
jest.mock('../../_lib/cognito/Lookup.ts', () => {
  const originalModule = jest.requireActual('../../_lib/cognito/Lookup');
  return {
    __esModule: true,
    ...originalModule,
    lookupRole: async (userPoolId:string, clientId:string, region:string):Promise<Role|undefined> => {
      role_lookup_attempts++;
      switch(clientId) {
        case 'clientIdForRoleLookupFailure':
          return undefined;
        default:
          return invitationRole
      }
    }
  }
});

/**
 * Define a partial mock for the dao.ts module
 */
jest.mock('../../_lib/dao/dao.ts', () => {
  return {
    __esModule: true,
    DAOFactory: {
      getInstance: jest.fn().mockImplementation(() => {
        return {
          create: async ():Promise<any> => { 
            create_user_attempts++;
            return {} as User|void;
          }, 
          read: async ():Promise<Invitation|Invitation[]> => {
            invitation_lookup_attempts++;
            const dte = new Date().toISOString();
            const basicMatch = { 
              entity_id: ENTITY_WAITING_ROOM,
              email: 'bugsbunny@warnerbros.com', 
              acknowledged_timestamp: dte, 
              consented_timestamp: dte 
            } as Invitation
            switch(invitationRole) {
              case Roles.RE_ADMIN:
                var match = Object.assign({}, basicMatch);
                match.role = Roles.RE_ADMIN;
                var roleMismatch = Object.assign({}, match);
                roleMismatch.role = Roles.SYS_ADMIN;
                var acknowledgeMismatch = Object.assign({}, match);
                acknowledgeMismatch.acknowledged_timestamp = undefined;
                var consentMismatch = Object.assign({}, match);
                consentMismatch.consented_timestamp = undefined;
                var entityMismatch = Object.assign({}, match);
                entityMismatch.entity_id = 'abc123';
                var retval = [ roleMismatch, acknowledgeMismatch, consentMismatch, entityMismatch ] as Invitation[];
                if(invitationScenario == 'match') {
                  retval.push(match);
                }
                return retval;
              case Roles.SYS_ADMIN:
                var match = Object.assign({}, basicMatch);
                match.role = Roles.SYS_ADMIN;
                var entityMismatch = Object.assign({}, match);
                entityMismatch.entity_id = 'abc123';
                var retval = [ entityMismatch ] as Invitation[];
                if(invitationScenario == 'match') {
                  retval.push(match);
                }
                return retval;
              case Roles.RE_AUTH_IND:
                var match = Object.assign({}, basicMatch);
                match.role = Roles.RE_AUTH_IND;
                match.entity_id = 'not_the_waiting_room';
                var entityMismatch = Object.assign({}, match);
                entityMismatch.entity_id = ENTITY_WAITING_ROOM;
                var retval = [ entityMismatch ] as Invitation[];
                if(invitationScenario == 'match') {
                  retval.push(match);
                }
                return retval;
            }
            return [] as Invitation[];
          }
        } as DAOInvitation|DAOUser
      })
    }
  }
});

const testHandler = () => {

  describe('Post signup lambda trigger: handler', () => {
    const resetMockCounters = () => {
      role_lookup_attempts = 0;
      create_user_attempts = 0;
      invitation_lookup_attempts = 0;
    }

    it('Should skip all SDK use if the event has no userpoolId, and throw error.', async () => {
      await expect(async () => {
        await handler({});
      }).rejects.toThrow();    
      expect(role_lookup_attempts).toEqual(0);
      expect(invitation_lookup_attempts).toEqual(0);
      expect(create_user_attempts).toEqual(0);
      resetMockCounters();
    });

    it('Should skip all SDK use if the event has no clientId, and throw error.' , async () => {
      await expect(async () => {
        await handler({
          userPoolId: 'us-east-2_J9AbymKIz',
        });
      }).rejects.toThrow();    
      expect(role_lookup_attempts).toEqual(0);
      expect(invitation_lookup_attempts).toEqual(0);
      expect(create_user_attempts).toEqual(0);
      resetMockCounters();
    });

    it('Should NOT attempt to make a dynamodb entry for the user if lookupRole fails', async () => {
      await expect(async () => {
        await handler({ userPoolId, callerContext: { clientId: 'clientIdForRoleLookupFailure' }});
      }).rejects.toThrow();    
      expect(role_lookup_attempts).toEqual(1);
      expect(invitation_lookup_attempts).toEqual(0);
      expect(create_user_attempts).toEqual(0);
      resetMockCounters();
    });

    it('Should NOT attempt to make a dynamodb entry for the user if client lookup found a match, \
    and a role could be ascertained, but insufficient attributes available in event.', async () => {
      await expect(async () => {
        await handler({ 
          userPoolId, 
          callerContext: { clientId }
        });
      }).rejects.toThrow();    
      expect(role_lookup_attempts).toEqual(1);
      expect(invitation_lookup_attempts).toEqual(0);
      expect(create_user_attempts).toEqual(0);
      resetMockCounters();
      
      await expect(async () => {
        await handler({ 
          userPoolId, 
          callerContext: { clientId },
          request: {
            userAttributes: {
              sub: 'asdgsgsfdgsdfg',
              phone_number: '+6175558888'
              // email will be missing
              // email_verified will be false/null
            }
          }
        });
      }).rejects.toThrow();    
      expect(role_lookup_attempts).toEqual(1);
      expect(invitation_lookup_attempts).toEqual(0);
      expect(create_user_attempts).toEqual(0);
      resetMockCounters();
    });

    it('Should make it as far as the invitation lookup if role lookup succeeds and \
    sufficient attributes came with the event, but still no user creation if invitation lookup fails', async () => {
      const event = { 
        userPoolId, 
        callerContext: { clientId },
        request: {
          userAttributes: {
            sub: 'asdgsgsfdgsdfg',
            email: 'daffyduck@warnerbros.com',
            email_verified: 'true',
            phone_number: '+6175558888',
            ['cognito:user_status']: 'CONFIRMED'
          }
        }
      };

      invitationRole = Roles.RE_ADMIN;
      invitationScenario = 'lookup_failure';
      await expect(async () => {
        await handler(event);     
      }).rejects.toThrow();
      expect(role_lookup_attempts).toEqual(1);
      expect(invitation_lookup_attempts).toEqual(1);
      expect(create_user_attempts).toEqual(0);
      resetMockCounters();

      invitationRole = Roles.SYS_ADMIN;
      invitationScenario = 'lookup_failure';
      await expect(async () => {
        await handler(event);     
      }).rejects.toThrow();
      expect(role_lookup_attempts).toEqual(1);
      expect(invitation_lookup_attempts).toEqual(1);
      expect(create_user_attempts).toEqual(0);
      resetMockCounters();

      invitationRole = Roles.RE_AUTH_IND;
      invitationScenario = 'lookup_failure';
      await expect(async () => {
        await handler(event);     
      }).rejects.toThrow();
      expect(role_lookup_attempts).toEqual(1);
      expect(invitation_lookup_attempts).toEqual(1);
      expect(create_user_attempts).toEqual(0);
      resetMockCounters();
    });

    it('Should carry out user creation if both role and invitation lookups succeed and sufficient \
    attributes came with the event', async () => {
      const event = { 
        userPoolId, 
        callerContext: { clientId },
        request: {
          userAttributes: {
            sub: 'asdgsgsfdgsdfg',
            email: 'daffyduck@warnerbros.com',
            email_verified: 'true',
            phone_number: '+6175558888',
            ['cognito:user_status']: 'CONFIRMED'
          }
        }
      };

      invitationRole = Roles.RE_ADMIN;
      invitationScenario = 'match';
      await handler(event);     
      expect(role_lookup_attempts).toEqual(1);
      expect(invitation_lookup_attempts).toEqual(1);
      expect(create_user_attempts).toEqual(1);
      resetMockCounters();

      invitationRole = Roles.SYS_ADMIN;
      invitationScenario = 'match';
      await handler(event);     
      expect(role_lookup_attempts).toEqual(1);
      expect(invitation_lookup_attempts).toEqual(1);
      expect(create_user_attempts).toEqual(1);
      resetMockCounters();

      invitationRole = Roles.RE_AUTH_IND;
      invitationScenario = 'match';
      await handler(event);     
      expect(role_lookup_attempts).toEqual(1);
      expect(invitation_lookup_attempts).toEqual(1);
      expect(create_user_attempts).toEqual(1);
      resetMockCounters();
    });
  });
}

const testAddUser = () => {
  describe('Post signup lambda trigger: addUserToDynamodb', () => {
    it('TODO: create this test', async () => {
      await new Promise<void>(resolve => {
        console.log('addUserToDynamodb');
        resolve();
      });
    })
  });
}

const testUndoLogin = () => {
  describe('Post signup lambda trigger: undoCognitoLogin', () => {
    it('TODO: create this test', async () => {
      await new Promise<void>(resolve => {
        console.log('undoCognitoLogin');
        resolve();
      });
    })
  });

}

testHandler();

testAddUser();

testUndoLogin();
