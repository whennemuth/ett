import { IContext } from '../../../../contexts/IContext';
import { ENTITY_WAITING_ROOM, EntityCrud } from "../../_lib/dao/dao-entity";
import { Entity, YN } from "../../_lib/dao/entity";

export enum EntityPublicTask {
  INVENTORY = 'inventory'
}

/**
 * Handler for the public API to retrieve entity information.
 * @param event 
 * @returns 
 */
export class EntityUtils {
  public performTask = async (task:EntityPublicTask):Promise<any> => {
    const { INVENTORY } = EntityPublicTask;

    switch(task) {
      case INVENTORY: 
        const dao = EntityCrud({ } as Entity);
        const inventory = (await dao.read() as Entity[]).filter((entity:Entity) => {
          if(entity.entity_id == ENTITY_WAITING_ROOM) return false;
          if(entity.active !== YN.Yes) return false;
          return true;
        });
        return inventory;
     }
  }
}



/**
 * RUN MANUALLY
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/public/Entity.ts')) {
  process.env.CLOUDFRONT_DOMAIN = 'd227na12o3l3dd.cloudfront.net';

  (async () => {

    const context:IContext = await require('../../../../contexts/context.json');
    const uri = `https://${process.env.CLOUDFRONT_DOMAIN}${context.PATHS.ENTITY_INVENTORY_PATH}`;
    console.log(`URI: ${uri}`);

    const entityUtils = new EntityUtils();
    const inventory = await entityUtils.performTask(EntityPublicTask.INVENTORY);
    console.log(`Inventory: ${JSON.stringify(inventory, null, 2)}`);
  })();
}