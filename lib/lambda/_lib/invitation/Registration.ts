import { DAOFactory, DAOInvitation } from "../dao/dao";
import { Invitation, InvitationFields } from "../dao/entity";

/**
 * The invitation has already been sent. That invitation now serves to register changes in state with regard
 * to the invited users registration (acknowledgement of privacy policy and registration with signature).
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

  /**
   * Update the database item for an invitation to reflect the acknowledgement time.
   * @returns 
   */
  public registerAcknowledgement = async (timestamp?:string):Promise<boolean> => {
    try {
      if( ! timestamp) {
        timestamp = new Date().toISOString();
      }

      const dao = DAOFactory.getInstance({ DAOType: 'invitation', Payload: {
        code:this.code, 
        [InvitationFields.acknowledged_timestamp]: timestamp       
      } as Invitation}) as DAOInvitation;

      const output = await dao.update();
      return true;
    }
    catch (e:any) {
      console.log(e);
      return false;      
    }
  }

  /**
   * Update the database item for an invitation to reflect the registration time along with the
   * email address and fullname values.
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
      } as Invitation}) as DAOInvitation;

      const output = await dao.update();
      return true;
    }
    catch (e:any) {
      console.log(e);
      return false;      
    }
  }  
} 