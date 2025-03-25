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
      const { code } = this;
      let dao = DAOFactory.getInstance({ DAOType: 'invitation', Payload: { code } }) as DAOInvitation;
      this.invitation = await dao.read() as Invitation|null;

      // Hack attack! Account for the slim possibility that the code is mangled by the client due to th

      if( ! this.invitation && code.startsWith('3D')) {
        /**
         * Hack attack! Invitation emails are sent with "Content-Transfer-Encoding: quoted-printable" as a
         * header. This means that the email client will encode the email body in quoted-printable format.
         * This means that the "=" character is encoded as "=3D". The raw text of emails is composed of lines
         * that are 76 characters long, ended by an "=" sign to indicate end of line. If the "=" character in
         * "=3D" lands exactly at this 76th spot, it is interpreted to indicate a newline. When this happens,
         * the "3D" portion of the "=3D" is interpreted literally. Hence a "code=xyz..." parameter in a 
         * querystring is reformed to "code=3Dxyz...". This is a hack to account for this possibility.
         */
        dao = DAOFactory.getInstance({ DAOType: 'invitation', Payload: { 
          code: code.slice(2)
        }}) as DAOInvitation;
        this.invitation = await dao.read() as Invitation|null;
      }
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

      const { email, fullname, title, entity_name, delegate, signup_parameter } = invitation;
      const _invitation = {
        code:this.code, 
        [InvitationFields.registered_timestamp]: timestamp,
        [InvitationFields.email]: email,
        [InvitationFields.fullname]: fullname,
        [InvitationFields.title]: title,
        [InvitationFields.delegate]: delegate,
        [InvitationFields.signup_parameter]: signup_parameter
      } as Invitation;

      if(entity_name) {
        _invitation[InvitationFields.entity_name] = entity_name;
      }
      
      const dao = DAOFactory.getInstance({ DAOType: 'invitation', Payload: _invitation}) as DAOInvitation;

      const output = await dao.update();
      return true;
    }
    catch (e:any) {
      error(e);
      return false;      
    }
  }  
} 