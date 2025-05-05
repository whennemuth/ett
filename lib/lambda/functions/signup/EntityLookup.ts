import { DAOFactory } from "../../_lib/dao/dao";
import { ENTITY_WAITING_ROOM } from "../../_lib/dao/dao-entity";
import { Entity, Invitation, Role, User, UserFields, YN } from "../../_lib/dao/entity";
import { lookupPendingInvitations } from "../../Utils";


export type EntityInfo = Entity & { users:User[], pendingInvitations:Invitation[], totalUserCount:number };
export type UserInfo = User & { entity:EntityInfo };

/**
 * Get the users information, including the entity details, as well as the other users in the entity.
 * @param email 
 * @param role 
 * @returns 
 */
export const lookupEntity = async (email:string, role:Role):Promise<UserInfo> => {
  email = email.toLowerCase();
  const userinfo = [ ] as UserInfo[];
  let totalUserCount = 0;

  // Should return just one user unless the same email has taken the same role at another entity (edge case).
  const getUser = async ():Promise<User[]> => {
    const dao = DAOFactory.getInstance({ DAOType:'user', Payload: { email }});
    let users = await dao.read() as User[];
    users = users.filter(user => user.active == YN.Yes && user.role == role);
    return users;
  }

  // Should return all the other users in the same entity as the current user.
  const getOtherUsers = async (entity_id:string):Promise<User[]> => {
    const dao = DAOFactory.getInstance({ DAOType:'user', Payload: { entity_id }});
    let users = await dao.read() as User[];
    users = users.filter(user => user.active == YN.Yes);
    totalUserCount = users.length; 
    users = users.filter(user => user.email != email);
    return users;
  }

  // Should return the entity details.
  const getEntity = async (entity_id:string):Promise<Entity|null> => {
    const dao = DAOFactory.getInstance({ DAOType:'entity', Payload: { entity_id }});
    return await dao.read() as Entity;
  }

  // Should return all pending invitations
  const pendingInvitationCache = {} as any;
  const getPendingInvitations = async (entity_id:string):Promise<Invitation[]> => {
    if(pendingInvitationCache[entity_id]) {
      return pendingInvitationCache[entity_id];
    }
    let invitations = await lookupPendingInvitations(entity_id) as Invitation[];
    pendingInvitationCache[entity_id] = invitations;
    return pendingInvitationCache[entity_id];
  }
  

  // 1) Get the user specified by the email. Almost never will this return more than
  // one entry, unless this user is a rep at more than one entity - should be RARE!
  const users = await getUser();

  // 2) Gather all the information about the entity and the other users in it.
  for(var i=0; i<users.length; i++) {
    var usr = Object.assign({} as any, users[i]);
    delete usr[UserFields.entity_id];
    if(users[i].entity_id == ENTITY_WAITING_ROOM) {
      usr.entity = {};
      continue;
    }
    usr.entity = await getEntity(users[i].entity_id) as Entity|null;
    // Get the other users in the entity and remove the entity_id value (extraneous)
    usr.entity.users = (await getOtherUsers(users[i].entity_id)).map(u => { 
      const retval = Object.assign({}, u) as any;
      delete retval.entity_id;
      return retval;
    });
    usr.entity.pendingInvitations = await getPendingInvitations(usr.entity.entity_id);
    usr.entity.totalUserCount = totalUserCount;
    userinfo.push(usr);
  }

  // 3) Consolidate the information, and return it in the response payload
  let user = {};
  if(userinfo.length == 1) user = userinfo[0];
  if(userinfo.length > 1) user = userinfo;
  return user as UserInfo;
}
