import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { User, Validator, Entity, Invitation, InvitationAttempt } from './entity';
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
export type DAOUser = Baseline & { read():Promise<User|User[]> };
export type DAOInvitation = Baseline & { read():Promise<Invitation|Invitation[]> };
export type DAOEntity = Baseline & { read():Promise<Entity|Entity[]> };

export type FactoryParms = {
  DAOType: 'user' | 'entity' | 'invitation',
  Payload: any
}

export class DAOFactory {
  constructor() { }
  
  public static getInstance(parms:FactoryParms): DAOUser|DAOInvitation|DAOEntity {
    switch(parms.DAOType) {

      case 'user':
        var { email, role, active } = parms.Payload as User;
        
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
        
        return EntityCrud(parms.Payload as Entity);

      case 'invitation':
        var { email, attempts } = parms.Payload as Invitation;
        if(attempts && attempts.length > 0) {
          var { role=undefined, link } = attempts[0] as InvitationAttempt;
        }
        
        if( ! email ) {
          throw new Error(`Invitation crud error: Missing email in ${JSON.stringify(parms, null, 2)}`);
        }
        if( role && ! validator.isRole(role)) {
          throw new Error(`Invitation crud error: Invalid role specified in ${JSON.stringify(parms, null, 2)}`);
        }
        return InvitationCrud(parms.Payload as Invitation);
    }
  }
}



