import { DAO, DAOFactory } from '../../_lib/dao/dao';
import { YN } from '../../_lib/dao/entity';
import { InvitationEmail } from '../../_lib/invitation'
import { SignupLink } from '../../_lib/signupLinks/SignupLink';

/**
 * This function performs all actions a gatekeeper can take to create/modify entities and 
 * invite "non-public" users (admins, authorized individuals)
 * @param _event 
 * @returns 
 */
export enum Task {
  CREATE_ENTITY = 'create_entity',
  UPDATE_ENTITY = 'update_entity',
  DEACTIVATE_ENTITY = 'deactivate_entity',
  INVITE_USER = 'invite_user'
}
export const handler = async (event:any) => {
  console.log(JSON.stringify(event, null, 2)); 

  const { ApiParameters: parms } = event.headers;
  const { task } = parms;

  switch(task as Task) {
    case Task.CREATE_ENTITY:
      await createEntity(parms);
      break;
    case Task.UPDATE_ENTITY:
      await updateEntity(parms);
      break;
    case Task.DEACTIVATE_ENTITY:
      await deactivateEntity(parms);
      break;
    case Task.INVITE_USER:
      await inviteUser(parms);
      break;
  } 
}

const createEntity = async (parms:any) => {
  const { entity_name, description } = parms;
  const dao:DAO = DAOFactory.getInstance({ DAOType: 'entity', Payload: { entity_name, description }});
}

const updateEntity = async (parms:any) => {
  const { entity_name, description, active } = parms;
  const dao:DAO = DAOFactory.getInstance({ DAOType: 'entity', Payload: {  entity_name, description, active }});
}

const deactivateEntity = async (parms:any) => {
  const { entity_name } = parms;
  updateEntity({ entity_name, active:YN.No });
}

/**
 * The cognito userpool client signup link can either have been passed in via the api call as a member
 * of the "ApiParameters" header, else it can be constructed by looking up userpool details via the 
 * userpool name.
 * @param parms 
 * @returns 
 */
const getSigninLink = async (parms:any):Promise<string|undefined> => {
  const { role, link } = parms;
  if(link) return link;
  const userPoolName = process.env.USERPOOL_NAME;
  let linkLookup:string|undefined;
  if(userPoolName) {
    const signupLink = new SignupLink(userPoolName);
    linkLookup = await signupLink.getLinkForRole(role);
  }
  return linkLookup;
}

/**
 * Invite the user via email and log a corresponding tracking entry in the database if successful.
 * @param parms 
 */
const inviteUser = async (parms:any) => {
  const { email, entity_name, role } = parms;
  const link = await getSigninLink(parms);
  if(link) {    
    const emailInvite = new InvitationEmail({ email, entity_name, role, link });
    if( await emailInvite.send()) {
      await emailInvite.persist();
    }    
  }
  else {
    throw new Error(`Unable to determine the url for ${role} signup`);
  }
}