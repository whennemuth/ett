import { LambdaProxyIntegrationResponse } from "../../../role/AbstractRole";
import { errorResponse, invalidResponse, log, lookupPendingInvitations, lookupSingleActiveEntity, lookupSingleEntity, lookupSingleUser, lookupUser, okResponse } from "../../Utils";
import { lookupEmail } from "../cognito/Lookup";
import { Configurations } from "../config/Config";
import { ENTITY_WAITING_ROOM } from "../dao/dao-entity";
import { ConfigNames, Entity, Invitation, Role, Roles, User, YN } from "../dao/entity"
import { UserInvitation } from "./Invitation";

export type InvitablePersonParms = {
  invitee:User, 
  inviterRole:Role, 
  linkGenerator:Function, 
  inviterCognitoUserName?:string
}

/**
 * This class performs all the necessary lookups and checks before inviting a user to ensure the invitation would
 * be valid and finally sends the inviation via email and logs a corresponding tracking entry in the database if 
 * successful.
 * @param parms 
 */
export class InvitablePerson {

  private parms:InvitablePersonParms;

  constructor(parms:InvitablePersonParms) {
    this.parms = parms;
  }

  public invite = async (): Promise<LambdaProxyIntegrationResponse> => {
    let { inviterRole, linkGenerator, inviterCognitoUserName, invitee: { email, entity_id, role } } = this.parms;
    if(email) email = email.toLowerCase();
    const { CLOUDFRONT_DOMAIN, PRIMARY_DOMAIN } = process.env;
    const primaryDomain = PRIMARY_DOMAIN || CLOUDFRONT_DOMAIN;
    if( ! primaryDomain) {
      return errorResponse(`Unable to determine the url for ${role} signup`);
    }
    else {
      let entity:Entity|null = null;
      const invitedByReAdmin = () => inviterRole == Roles.RE_ADMIN;
      const invitedToWaitingRoom = () => entity_id == ENTITY_WAITING_ROOM;
      const invitingAuthInd = () => role == Roles.RE_AUTH_IND
      const lookupInviterViaCognito = async (_role:Role): Promise<User[]> => {
        let matches = [] as User[];
        if(inviterCognitoUserName) {
          const inviterEmail = await lookupEmail(
            process.env.USERPOOL_ID || '', 
            inviterCognitoUserName, 
            process.env.REGION || ''
          );
          if(inviterEmail) {
            matches = (await lookupUser(inviterEmail)).filter((user) => {
              return user.role == _role && user.active == YN.Yes;
            });
          }
        }
        return matches;
      }

      // Prevent RE_ADMIN from inviting any other role than AUTH_IND
      if(invitedByReAdmin() && ! invitingAuthInd()) {
        return invalidResponse(`An ${Roles.RE_ADMIN} can only invite a ${Roles.RE_AUTH_IND}`);
      }

      // Prevent RE_ADMIN from inviting anyone to the waiting room (only SYS_ADMIN can do that).
      if(invitedByReAdmin() && invitedToWaitingRoom()) {
        return invalidResponse(`An ${Roles.RE_ADMIN} cannot invite anyone into the waiting room`);
      }

      // Attempt to lookup the entity
      if(entity_id && ! invitedToWaitingRoom()) {
        entity = await lookupSingleActiveEntity(entity_id) as Entity;
        if( ! entity) {
          return invalidResponse(`Entity ${entity_id} lookup failed`);
        }
      }

      // Lookup the inviter.
      let inviterLookupMatches = [] as User[];
      if(invitedByReAdmin()) {
        inviterLookupMatches = await lookupInviterViaCognito(Roles.RE_ADMIN);
        if(inviterLookupMatches.length == 0 && ! entity_id) {
          return invalidResponse(`Lookup for ${Roles.RE_ADMIN} inviter failed`);
        }
        if(inviterLookupMatches.length == 1 && ! entity_id) {
          entity_id = inviterLookupMatches[0].entity_id;
        }
      }

      // Prevent an RE_ADMIN from inviting someone to an entity they are not themselves a member of.
      if(invitedByReAdmin() && inviterLookupMatches.length > 0 && entity_id) {
        if( ! inviterLookupMatches.some(m => m.entity_id == entity_id)) {
          return invalidResponse(`The ${Roles.RE_ADMIN} cannot invite anyone to entity: ${entity_id} if they are not a member themselves.`);
        }
      }

      // Bail out if the entity is undetermined and the RE_ADMIN inviter belongs to more than one entity.
      if(invitedByReAdmin() && inviterLookupMatches.length > 1 && ! entity_id) {
        const msg = `The inviter appears to be a ${Roles.RE_ADMIN} for multiple entities`;
        const listing = (inviterLookupMatches).reduce((list:string, _user:User) => {
          return `${list}, ${_user.entity_id}`
        }, '');
        return invalidResponse(`${msg}: ${listing} - it is not clear to which the invitation applies.`);
      }

      // Bail out at this point if the entity is still undetermined and the inviter is a RE_ADMIN
      if(invitedByReAdmin() && ! entity_id ) {
        return invalidResponse(`Cannot determine entity to invite ${email} to.`);
      }

      // Default the entity as the waiting room.
      if( ! entity_id) {
        entity_id = ENTITY_WAITING_ROOM
        entity = { entity_id, active: YN.Yes, entity_name:entity_id } as Entity
      }

      // Lookup the user to be invited
      let user: User | null = null;
      if(entity_id == ENTITY_WAITING_ROOM && role != Roles.SYS_ADMIN) {
        const users = await lookupUser(email) ?? [];
        if(users.length > 0) {
          user = users[0];
        }
        if(user) {
          entity = await lookupSingleEntity(user?.entity_id);
        }
      }
      else {
        user = await lookupSingleUser(email, entity_id);
      }

      // Prevent inviting the user if they already have an account with the specified entity.
      if(user && user.active == YN.Yes) {
        return invalidResponse(`Invitee ${email} has already accepted invitation for entity ${entity?.entity_name}`);
      }

      // Prevent inviting a non-RE_AUTH_IND user if somebody has already been invited for the same role in the same entity.
      const pendingInvitations = await lookupPendingInvitations(entity_id) as Invitation[];
      log(`Checking existing/prior invitations for ${role} to ${entity_id} for conflicts...`);
      const conflictingInvitations = pendingInvitations.filter((invitation) => {
        if(invitation.retracted_timestamp) return false;
        if(invitedToWaitingRoom()) return false; // Anybody can be invited into the waiting room.
        if(invitation.role == Roles.RE_AUTH_IND) return false; // You can invite any number of AUTH_IND users to an entity (despite config limit).

        const { registered_timestamp, retracted_timestamp, sent_timestamp, email:invEmail, role } = invitation;
        const sent = sent_timestamp ? new Date(sent_timestamp).getTime() : 0;
        const registered = registered_timestamp ? new Date(registered_timestamp).getTime() : 0;
        const retracted = retracted_timestamp ? new Date(retracted_timestamp).getTime() : 0;

        if(retracted > sent) {
          log(`${invEmail} is NOT invited as ${role} because the their invitation was retracted after 
            it was last sent. Thus they are re-invitable to register`);
          return false; 
        }

        if(sent > registered) {
          // The user has not registered with this invitation yet, So, Figure out if the invitation has expired.
          const mils = Date.now() - sent;
          const configs = new Configurations();
          let expireAfterMils = 0;
          (async () => {
            expireAfterMils = (await configs.getAppConfig(ConfigNames.ASP_INVITATION_EXPIRE_AFTER)).getDuration() * 1000;
          })();
          if(mils >= expireAfterMils) {
            log(`${invEmail} was invited to register as ${role}, but that invitation expired. Thus they are re-invitatable`);
            return false;
          }
        }

        let deactivated = true;
        (async () => {
          const invitedUser = await lookupSingleUser(invEmail, entity_id);
          if( ! invitedUser || ! invitedUser.active || invitedUser.active == YN.No) {
            log(`${invEmail} has used non-retracted invitation to register as ${role}, 
              but has since been deactivated. Thus they are re-invitable (to re-register)`);
            return;
          }
          deactivated = false;
        })();

        if(deactivated) {
          return false; // Another user was invited for the same role in the same entity, but they are not active, exclude them as conflicting.
        }

        return true; // Another currently active user was invited for the same role in the same entity, thus conflicting.
      });

      if(conflictingInvitations.length > 0) {
        return invalidResponse(`One or more individuals already have outstanding invitations for role: ${role} in entity: ${entity_id}`);
      }

      const link = await linkGenerator(entity_id, role);

      // Instantiate an invitation
      const emailInvite = new UserInvitation(
        { entity_id, email, role } as Invitation, 
        link, 
        entity?.entity_name || ENTITY_WAITING_ROOM);
      
      // Send the invitation
      if( await emailInvite.send({ expires:true, persist:true })) {
        const msg = `Invitation successfully sent: ${emailInvite.code}`
        return okResponse(msg, { invitation_code: emailInvite.code, invitation_link: emailInvite.link });
      }
      else {
        const msg = `Invitation failure: ${emailInvite.code}`;
        return errorResponse(msg);
      } 
    }
  }
}