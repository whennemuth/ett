import { QueryCommandInput } from '@aws-sdk/client-dynamodb';
import { ConfigCrud } from './dao-config';
import { ConsenterCrud } from './dao-consenter';
import { EntityCrud } from './dao-entity';
import { InvitationCrud } from './dao-invitation';
import { UserCrud } from './dao-user';
import { Config, Consenter, Entity, Invitation, User, Validator } from './entity';

const validator = Validator();

type Baseline = {
  create():Promise<any>; 
  update(oldEntity?:any, merge?:boolean):Promise<any>; 
  Delete(reportDeleted?:boolean):Promise<any>; 
  dryRun():any;
  test():Promise<any>;
}
export type ReadParms = {
  convertDates:boolean,
  filterExpressions?: Array<(input: QueryCommandInput) => void>;
};
export type DAOUser = Baseline & { 
  read(parms?:ReadParms):Promise<(User|null)|User[]>, 
  migrate(old_entity_id:string):Promise<any>,
  deleteEntity():Promise<any>;
};
export type DAOInvitation = Baseline & { 
  code():string, 
  read(parms?:ReadParms):Promise<(Invitation|null)|Invitation[]>
  deleteEntity():Promise<any>;
};
export type DAOEntity = Baseline & { 
  id():string, 
  read(parms?:ReadParms):Promise<(Entity|null)|Entity[]>
};
export type DAOConsenter = Baseline & {
  read(parms?:ReadParms):Promise<(Consenter|null)|Consenter[]>
}
export type DAOConfig = Baseline & {
  read(parms?:ReadParms):Promise<(Config|null)|Config[]>
}

export type FactoryParms = {
  DAOType: 'user' | 'entity' | 'invitation' | 'consenter' | 'config',
  Payload: any
}

export class DAOFactory {
  constructor() { }
  
  public static getInstance(parms:FactoryParms): DAOUser|DAOInvitation|DAOEntity|DAOConsenter|DAOConfig {
    switch(parms.DAOType) {

      case 'user':
        var { email=undefined, entity_id=undefined, role=undefined, active } = parms.Payload as User;
        if( role && ! validator.isRole(role)) {
          throw new Error(`User crud error: Invalid role specified in: ${JSON.stringify(parms, null, 2)}`);
        }
        if( active && ! validator.isYesNo(active)) {
          throw new Error(`User crud error: Invalid Y/N active field value specified in ${JSON.stringify(parms, null, 2)} as ${role}: ${active}`);
        }
        
        return UserCrud({ userinfo: parms.Payload as User });
        
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

      case 'consenter':
        var { active } = parms.Payload as Consenter;

        if( active && ! validator.isYesNo(active)) {
          throw new Error(`Consenter crud error: Invalid Y/N active field value specified in ${JSON.stringify(parms, null, 2)}: ${active}`);
        }
        return ConsenterCrud({ consenterInfo: parms.Payload as Consenter });

      case 'config':
        return ConfigCrud(parms.Payload as Config);
    }
  }
}



