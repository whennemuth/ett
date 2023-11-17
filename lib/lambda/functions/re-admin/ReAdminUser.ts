
import { DAO, DAOFactory } from '../../_lib/dao/dao';

export const handler = async (event:any) => {

  console.log(JSON.stringify(event, null, 2));

  const { task, email, entity_name, role, fullname } = event.headers.ApiParameters;

  const dir = Directory(email);

  const dao:DAO = DAOFactory.getInstance({ 
    DAOType: 'user', 
    Payload: { 
      email, entity_name, role, fullname 
  }});

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

  const sendInvitationToSignUp = async () => {
    console.log(`Sending userpool email invitation for ${email}`);
  }

  return {
    sendInvitationToSignUp,
  }
}