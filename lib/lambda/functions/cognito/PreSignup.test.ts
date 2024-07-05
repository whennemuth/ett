import { DAOConsenter, ReadParms } from '../../_lib/dao/dao';
import { Consenter, Invitation, Role, Roles } from '../../_lib/dao/entity';
import { Messages, handler } from './PreSignup';
import * as event from './PreSignupEventMock.json'

let invitationLookupResults = [] as Invitation[];
jest.mock('../../_lib/dao/dao.ts', () => {
  return {
    __esModule: true,
    DAOFactory: {
      getInstance: jest.fn().mockImplementation(() => {
        return {
          read: async ():Promise<(Invitation|null)|Invitation[]> => {
            return invitationLookupResults;
          }
        }
      })
    }
  }
});

let role:Role|undefined;
/**
 * Define a partial mock for the cognito Lookup.ts module
 */
jest.mock('../../_lib/cognito/Lookup.ts', () => {
  const originalModule = jest.requireActual('../../_lib/cognito/Lookup');
  return {
    __esModule: true,
    ...originalModule,
    lookupRole: async (userPoolId:string, clientId:string, region:string):Promise<Role|undefined> => {
      return role;
    }
  }
});

jest.mock('../../_lib/dao/dao-consenter.ts', () => {
  const originalModule = jest.requireActual('../../_lib/dao/dao-consenter');
  return {
    __esModule: true,
    ...originalModule,
    ConsenterCrud: (consenterInfo:Consenter, _dryRun:boolean=false): DAOConsenter => {
      return {
        read: async (readParms?:ReadParms):Promise<(Consenter|null)|Consenter[]> => {
          return { email: consenterInfo.email } as Consenter
        }
      } as DAOConsenter
    }
  }
});

describe('Pre signup lambda trigger: handler', () => {

  it('Should throw anticipated error if role lookup fails', async () => {
    role = undefined;
    expect(async () => {
      await handler(event);
    }).rejects.toThrow(new Error(Messages.ROLE_LOOKUP_FAILURE));
  });

  it('Should return without error if the role is for consenting person', async () => {
    role = Roles.CONSENTING_PERSON;
    const retval = await handler(event);
    expect(retval).toEqual(event);
  });

  it('Should error out if there are no matching registered invitations', async () => {
    role = Roles.RE_ADMIN;
    invitationLookupResults = [] as Invitation[];
    expect(async () => {
      await handler(event);
    }).rejects.toThrow(new Error(Messages.UNINVITED + role));
  });

  it('Should error out if there are matching registered invitations, but none that match by role', async () => {
    role = Roles.RE_ADMIN;
    const dte = new Date().toISOString();
    invitationLookupResults = [
      { role: Roles.SYS_ADMIN, acknowledged_timestamp: dte, registered_timestamp: dte },
      { role: Roles.RE_AUTH_IND, acknowledged_timestamp: dte, registered_timestamp: dte },      
    ] as Invitation[];
    expect(async () => {
      await handler(event);
    }).rejects.toThrow(new Error(Messages.UNINVITED + role));
  });

  it('Should return without error if only invitation attempts that match by role, but are retracted', async () => {
    role = Roles.RE_ADMIN;
    const dte = new Date().toISOString();
    invitationLookupResults = [
      { 
        role: Roles.RE_ADMIN, 
        acknowledged_timestamp: dte, 
        registered_timestamp: dte, 
        retracted_timestamp: dte 
      },      
    ] as Invitation[];
    expect(async () => {
      await handler(event);
    }).rejects.toThrow(new Error(Messages.RETRACTED + role));
  });

  it('Should return gracefully if finds one or more registered invitation attempts that match by role', async () => {
    role = Roles.RE_ADMIN;
    const dte = new Date().toISOString();
    
    invitationLookupResults = [
      { role: Roles.RE_ADMIN, acknowledged_timestamp: dte, registered_timestamp: dte },      
    ] as Invitation[];
    let retval = await handler(event);
    expect(retval).toEqual(event);
    
    invitationLookupResults = [
      { role: Roles.RE_ADMIN, acknowledged_timestamp: dte, registered_timestamp: dte },      
      { role: Roles.RE_ADMIN, acknowledged_timestamp: dte, registered_timestamp: dte }   
    ] as Invitation[];
    retval = await handler(event);
    expect(retval).toEqual(event);
  });
});