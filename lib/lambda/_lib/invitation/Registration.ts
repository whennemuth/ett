import { error } from "../../Utils";
import { DAOFactory, DAOInvitation } from "../dao/dao";
import { Entity, Invitation, InvitationFields } from "../dao/entity";

/**
 * The invitation has already been sent. That invitation now serves to register changes in state with regard
 * to the invited users registration steps.
 */
export class Registration {

  private code:string;
  private invitation:Invitation|null;

  constructor(code:string) {
    this.code = code;
  }

  public getInvitation = async (): Promise<Invitation|null> => {
    if(this.invitation == undefined) {
      const dao = DAOFactory.getInstance({ DAOType: 'invitation', Payload: { code: this.code } }) as DAOInvitation;
      this.invitation = await dao.read() as Invitation|null;
    }
    return this.invitation;    
  }

  public entityNameAlreadyInUse = async (entity_name:string):Promise<boolean> => {
    const entity_name_lower = entity_name.trim().toLowerCase();
    const dao = DAOFactory.getInstance({ DAOType:'entity', Payload: { entity_name_lower } });
    const matches = await dao.read() as Entity[];
    return matches.length > 0;
  }

  /**
   * Update the database item for an invitation to reflect the registration time along with the
   * email address, fullname, and entity_name values.
   * @returns 
   */
  public registerUser = async (invitation:Invitation, timestamp?:string):Promise<boolean> => {
    try {
      if( ! timestamp) {
        timestamp = new Date().toISOString();
      }

      const dao = DAOFactory.getInstance({ DAOType: 'invitation', Payload: {
        code:this.code, 
        [InvitationFields.registered_timestamp]: timestamp,
        [InvitationFields.email]: invitation.email,
        [InvitationFields.fullname]: invitation.fullname,
        [InvitationFields.title]: invitation.title,
        [InvitationFields.entity_name]: invitation.entity_name,
      } as Invitation}) as DAOInvitation;

      const output = await dao.update();
      return true;
    }
    catch (e:any) {
      error(e);
      return false;      
    }
  }  
} 