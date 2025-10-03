import { IContext } from "../../../../contexts/IContext";
import { DAOEntity, DAOFactory } from "../../_lib/dao/dao";
import { ENTITY_WAITING_ROOM } from "../../_lib/dao/dao-entity";
import { Entity, EntityFields, Roles, YN } from "../../_lib/dao/entity";
import { getCustomDomain, log, lookupCloudfrontDomain } from "../../Utils";
import { inviteASingleUser } from "./SysAdminUser";

/**
 * Invite a sysadmin user to the system with parameters and environment variable valuses derived from context.json
 * @returns A payload suitable for passing to inviteASingleUser()
 */
export const generateInvitePayload = async (email:string): Promise<any> => {
  const context:IContext = await require('../../../../contexts/context.json');
  const { STACK_ID, REGION, TAGS: { Landscape } } = context;
  const prefix = `${STACK_ID}-${Landscape}`;

  process.env.USERPOOL_NAME = `${prefix}-cognito-userpool`; 
  process.env.COGNITO_DOMAIN = `${prefix}.auth.${REGION}.amazoncognito.com`;
  process.env.REGION = REGION;
  process.env.DEBUG = 'true';

  const daoEntityRead = DAOFactory.getInstance({ 
    DAOType: 'entity',
    Payload: { [EntityFields.entity_id]: ENTITY_WAITING_ROOM }
  }) as DAOEntity;

  let entity:(Entity|null)|Entity[] = await daoEntityRead.read();
  if( ! entity) {
    const daoEntityCreate = DAOFactory.getInstance({ 
      DAOType: 'entity', 
      Payload: { 
        [EntityFields.entity_id]: ENTITY_WAITING_ROOM, 
        [EntityFields.entity_name]: ENTITY_WAITING_ROOM, 
        [EntityFields.description]: 'The "waiting room", a pseudo-entity for new users not associated yet with a real entity.',
        [EntityFields.active]: YN.Yes,
      }
    }) as DAOEntity;
    entity = await daoEntityCreate.create();
  }

  const cloudfrontDomain:string|undefined = await lookupCloudfrontDomain(Landscape);
  const primaryDomain = getCustomDomain() ?? cloudfrontDomain;
  if( ! cloudfrontDomain) {
    throw('Cloudfront domain lookup failure');
  }

  process.env.CLOUDFRONT_DOMAIN = cloudfrontDomain;
  process.env.PRIMARY_DOMAIN = primaryDomain;
  process.env.REDIRECT_URI = `https://${primaryDomain}/bootstrap/index.htm`;
  // process.env.REDIRECT_URI = `https://${primaryDomain}/index.html`;

  return { email, role: Roles.SYS_ADMIN };
};


const { argv:args } = process;
console.log(`Args: ${args}`);
if(args.length > 2 && args[2] === '--email' && args[3].includes('@')) {
  (async () => {
    const payload = await generateInvitePayload(args[3]);
    const retval = await inviteASingleUser(payload);
    log(retval, `Invitation complete. Returned value`);
  })();
}


