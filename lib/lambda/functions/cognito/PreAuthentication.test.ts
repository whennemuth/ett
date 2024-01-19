import { Role, Roles, User, YN } from '../../_lib/dao/entity';
import { handler, Messages } from  './PreAuthentication';
import * as event from './PreAuthenticationEventMock.json';

const mockUser1:User = {
  email: '',
  entity_name: '',
  sub: '',
  active: YN.No,
  role: Roles.SYS_ADMIN,
};
const mockUser2:User = {
  email: '',
  entity_name: '',
  sub: '',
  active: YN.Yes,
  role: Roles.RE_ADMIN,
};
const mockUser3:User = {
  email: '',
  entity_name: '',
  sub: '',
  active: YN.No,
  role: Roles.RE_AUTH_IND,
};

let mockUsers:User[] = [ mockUser1, mockUser2, mockUser3 ];

jest.mock('../../_lib/dao/dao.ts', () => {
  return {
    __esModule: true,
    DAOFactory: {
      getInstance: jest.fn().mockImplementation(() => {
        return {
          read: async ():Promise<User|User[]> => {
            return new Promise((resolve, reject) => {
              resolve(mockUsers as User[]);
            });
          }
        }
      })
    }
  }
});

let role:Role|undefined;
jest.mock('./RoleLookup.ts', () => {
  return {
    __esModule: true,
    lookupRole: async ():Promise<Role|undefined> => {
      return new Promise((resolve, reject) => {
        resolve(role);
      });
    }
  }
});

describe('Pre-authentication lambda trigger: handler', () => {

  it('Should throw anticipated error if role lookup fails', async () => {
    role = undefined;
    expect(async () => {
      await handler(event);
    }).rejects.toThrow(new Error(Messages.ROLE_LOOKUP_FAILURE));
  });

  it('Should throw anticipated error if account is not enabled', async () => {
    role = Roles.SYS_ADMIN;
    event.request.userAttributes['cognito:user_status'] = 'UNCONFIRMED';
    expect(async () => {
      await handler(event);
    }).rejects.toThrow(new Error(Messages.ACCOUNT_UNCONFIRMED));
  });

  it('Should throw anticipated error if email is NOT verified', async () => {
    role = Roles.SYS_ADMIN;
    event.request.userAttributes['cognito:user_status'] = 'CONFIRMED';
    event.request.userAttributes.email_verified = 'false';
    expect(async () => {
      await handler(event);
    }).rejects.toThrow(new Error(Messages.EMAIL_UNVERIFIED));
  });

  it('Should throw anticipated error if email lookup fails', async () => {
    role = Roles.SYS_ADMIN;
    event.request.userAttributes['cognito:user_status'] = 'CONFIRMED';
    event.request.userAttributes.email_verified = 'true';
    event.request.userAttributes.email = '';
    expect(async () => {
      await handler(event);
    }).rejects.toThrow(new Error(Messages.EMAIL_LOOKUP_FAILURE));
  });

  it('Should throw anticipated error if user is deactivated', async () => {
    role = Roles.SYS_ADMIN;
    event.request.userAttributes['cognito:user_status'] = 'CONFIRMED';
    event.request.userAttributes.email_verified = 'true';
    event.request.userAttributes.email = 'daffyduck@warnerbros.com';
    mockUser1.active = YN.No;
    mockUsers = [ mockUser1 ];
    expect(async () => {
      await handler(event);
    }).rejects.toThrow(new Error(Messages.ACCOUNT_DEACTIVATED.replace('role', `${role} role`)));
  });

  it('Should throw anticipated error if user is unauthorized', async () => {
    role = Roles.SYS_ADMIN;
    event.request.userAttributes['cognito:user_status'] = 'CONFIRMED';
    event.request.userAttributes.email_verified = 'true';
    event.request.userAttributes.email = 'daffyduck@warnerbros.com';
    mockUser1.active = YN.Yes;
    mockUser1.role = Roles.RE_ADMIN;
    mockUsers = [ mockUser1 ];
    expect(async () => {
      await handler(event);
    }).rejects.toThrow(new Error(Messages.UNAUTHORIZED + role));

    mockUsers = [ mockUser2, mockUser1, mockUser3 ];
    expect(async () => {
      await handler(event);
    }).rejects.toThrow(new Error(Messages.UNAUTHORIZED + role));
  });

  it('Should return the original event if the user is authorized', async () => {
    role = Roles.SYS_ADMIN;
    event.request.userAttributes['cognito:user_status'] = 'CONFIRMED';
    event.request.userAttributes.email_verified = 'true';
    event.request.userAttributes.email = 'daffyduck@warnerbros.com';
    mockUser1.active = YN.Yes;
    mockUser1.role = Roles.SYS_ADMIN;
    mockUsers = [ mockUser1 ];
    let retval = await handler(event);
    expect(retval).toBe(event);

    mockUsers = [ mockUser3, mockUser2, mockUser1 ];
    retval = await handler(event);
    expect(retval).toBe(event);
  });
});