import { DAOInvitation } from "../dao/dao";
import { Invitation, Roles } from "../dao/entity";
import { Registration } from "./Registration";

let daoReadAttempts = 0;
let daoUpdateAttempts = 0;
const code = 'abc123';
const mockInvitation = {
  code,
  entity_id: 'Boston University',
  message_id: '0cea3257-38fd-4c24-a12f-fd731f19cae6',
  role: Roles.SYS_ADMIN,
  sent_timestamp: new Date().toISOString(),
} as Invitation

jest.mock('../../_lib/dao/dao.ts', () => {
  return {
    __esModule: true,
    DAOFactory: {
      getInstance: jest.fn().mockImplementation(() => {
        return {
          read: async ():Promise<Invitation> => {
            daoReadAttempts++;
            return new Promise((resolve, reject) => {
              resolve(mockInvitation);
            });
          },
          update: async ():Promise<any> => {
            daoUpdateAttempts++;
            return new Promise((resolve, reject) => {
              switch(daoUpdateAttempts) {
                case 1: case 3:
                  reject('Failed to update invitation in dynamodb');
                  break;
                case 2: case 4:
                  resolve({ $metadata: {} });
                  break;
                default:
                  console.log('Not expecting this');
              }
            });
          }
        } as DAOInvitation
      })
    }
  }
});

describe('getInvitation', () => {

  it('Should attempt a database lookup only once', async () => {
    const registration = new Registration(code);
    expect(daoReadAttempts).toEqual(0);
    
    // Call a method that should trigger a database lookup
    const invitation1:Invitation|null = await registration.getInvitation();
    expect(invitation1).toBeDefined();
    expect(daoReadAttempts).toEqual(1);
    expect(invitation1).toEqual(mockInvitation);

    // Call again and assert that the database lookup counter has NOT advanced
    const invitation2:Invitation|null = await registration.getInvitation();
    expect(invitation2).toBeDefined();
    expect(daoReadAttempts).toEqual(1);
    expect(invitation2).toEqual(mockInvitation);
  });
});

describe('registerUser', () => {
  
  it('Should return false if an error occurs', async () => {
    const registration = new Registration(code);
    expect(await registration.registerUser({ 
      email: 'daffyduck@warnerbros.com',
      fullname: 'Daffy Duck',
      title: 'Cartoon Character'
    } as Invitation)).toBe(false);
    expect(daoUpdateAttempts).toEqual(1);
  });

  it('Should return true if no error occurs', async () => {
    const registration = new Registration(code);
    expect(await registration.registerUser({ 
      email: 'bugsbunny@warnerbros.com',
      fullname: 'Bugs Bunny',
      title: 'Cartoon Character'
    } as Invitation)).toBe(true);
    expect(daoUpdateAttempts).toEqual(2);
  });
});