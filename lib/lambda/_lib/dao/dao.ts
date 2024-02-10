import { User, Validator, Entity, Invitation } from './entity';
import { UserCrud } from './dao-user';
import { InvitationCrud } from './dao-invitation';
import { EntityCrud } from './dao-entity';

const validator = Validator();

type Baseline = {
  create():Promise<any>; 
  update():Promise<any>; 
  Delete():Promise<any>; 
  test():Promise<any> 
}
export type DAOUser = Baseline & { read():Promise<(User|null)|User[]> };
export type DAOInvitation = Baseline & { code():string, read():Promise<(Invitation|null)|Invitation[]> };
export type DAOEntity = Baseline & { id():string, read():Promise<Entity|null> };

export type FactoryParms = {
  DAOType: 'user' | 'entity' | 'invitation',
  Payload: any
}

export class DAOFactory {
  constructor() { }
  
  public static getInstance(parms:FactoryParms): DAOUser|DAOInvitation|DAOEntity {
    switch(parms.DAOType) {

      case 'user':
        var { email=undefined, role=undefined, active } = parms.Payload as User;
        
        if( ! email ) {
          throw new Error(`User crud error: Missing email in ${JSON.stringify(parms, null, 2)}`);
        }
        if( role && ! validator.isRole(role)) {
          throw new Error(`User crud error: Invalid role specified in: ${JSON.stringify(parms, null, 2)}`);
        }
        if( active && ! validator.isYesNo(active)) {
          throw new Error(`User crud error: Invalid Y/N active field value specified in ${JSON.stringify(parms, null, 2)} as ${role}: ${active}`);
        }
        
        return UserCrud(parms.Payload as User);
        
      case 'entity':
        var { active } = parms.Payload as Entity;

        if( active && ! validator.isYesNo(active)) {
          throw new Error(`Entity crud error: Invalid Y/N active field value specified in ${JSON.stringify(parms, null, 2)} as ${role}: ${active}`);
        }

        return EntityCrud(parms.Payload as Entity);

      case 'invitation':
        var { role=undefined } = parms.Payload as Invitation;
        
        if( role && ! validator.isRole(role)) {
          throw new Error(`Invitation crud error: Invalid role specified in ${JSON.stringify(parms, null, 2)}`);
        }
        return InvitationCrud(parms.Payload as Invitation);
    }
  }
}



