import { TransactWriteItemsCommandOutput } from "@aws-sdk/client-dynamodb";
import { DAOFactory, DAOUser } from "./dao";
import { User, UserFields } from "./entity";
import { UserCrud } from "./dao-user";

jest.mock('../../_lib/dao/dao.ts', () => {
  return {
    __esModule: true,
    DAOFactory: {
      getInstance: jest.fn().mockImplementation((parms:any) => {
        const dao = UserCrud({ userinfo: parms.Payload as User });
        return {
          read: async ():Promise<any> => {
            return new Promise((resolve, reject) => {
              resolve({
                email: 'somebody@gmail.com', entity_id: 'abc123'
              } as User);
            });
          },
          migrate: async (old_entity_id:string):Promise<TransactWriteItemsCommandOutput|undefined> => {
            return dao.migrate(old_entity_id);
          }
        } as DAOUser
      })
    }
  }
});

/**
 * Have to test this in its own module because it requires partially mocking the same object
 * that is also under test. That is, the migrate method creates within itself another instance
 * of DAOUser in order to perform a read() operation. The read() method is mocked and the migrate
 * method is not since it is under test. jest.fn() or jest.spyOn() for assignment of mock 
 * implementations to directly replace the read method did not work and were ignored, and the 
 * global mock above adversely affects the other unit tests in dao-user.test.js if put there, 
 * hence it is here in its own module for its own dedicated test. 
 */
describe('Dao user migrate', () => {
  it('Should error if email to migrate is missing', async () => {
    expect(async () => {
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.entity_id]: 'mock_entity_id',
      }}) as DAOUser;
      await dao.migrate('old_entity_id');
    }).rejects.toThrow(/^User migrate error: Missing email to migrate in/);
  });

  it('Should error if entity_id to migrate to is missing', async () => {
    expect(async () => {
      const dao = DAOFactory.getInstance({
        DAOType: 'user', Payload: {
          [UserFields.email]: 'mockemail@gmail.com',
      }}) as DAOUser;
      await dao.migrate('old_entity_id');
    }).rejects.toThrow(/^User migrate error: Missing migration target entity_id in/);
  });
});
