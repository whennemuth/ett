
import { DAO, DAOFactory } from 'ett-dao/dao';

export const handler = async (event:any) => {

  console.log(JSON.stringify(event, null, 2));

  const { task, email, entity_name, role, fullname } = event.headers.ApiParameters;

  const dir = Directory(email);

  const dao:DAO = DAOFactory.getInstance({ email, entity_name, role, fullname });

  let user;
  let response;

  switch(task) {
    case 'create-user':
      user = User(dir, dao);
      response = await user.create();
      break;
    case 'invite-user':
      user = User(dir, dao);
      response = await user.create();
      if(response) {
        await user.invite();
      }
      break;
    case 'bulk-invite-user':
      
      break;
  }
}

/**
 * Represents a single user of any role.
 * @param {*} directory 
 * @param {*} dao 
 * @returns 
 */
export function User(directory:any, dao:DAO) {
  return {
    create: async () => {
      return await dao.create();
    },
    invite: async () => {
      return await directory.sendInvitationToSignUp();
    }
  }
}

export function Directory(email:string) {

  /**
   * RESUME NEXT: 
   * 1) Put all dao crud operations through test harness.
   * 2) Figure out how to get user signup in cognito to trigger lambda dao crud create.
   * The user pool client should indicate the role - would the lambda get passed the claims somehow?
   * 3) Create a cognito lib (like dao.ts) that invites a user and then use dao.ts to update the 
   * corresponding dynamodb item to reflect the fact of the invitation, and add to entity.ts so that the 
   * data model also includes invitation members. 
   */
  const sendInvitationToSignUp = async () => {
    console.log(`Sending userpool email invitation for ${email}`);
  }

  return {
    sendInvitationToSignUp,
  }
}