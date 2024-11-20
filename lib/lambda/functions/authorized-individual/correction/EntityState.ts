import { CONFIG } from "../../../../../contexts/IContext";
import { Configurations, IAppConfig } from "../../../_lib/config/Config";
import { ConfigNames, Entity, Role, Roles, User, YN } from "../../../_lib/dao/entity";
import { Personnel } from "./EntityPersonnel";

const MINIMUM_AIS = 2;
const MINIMUM_ASPS = 1;

/**
 * This class represents an entity with respect to how long it may have been without the full complement
 * of users of either role, RE_ADMIN (asp) or RE_AUTH_IND (ai). This helps determine if an entity has 
 * remained beyond the allowed time after removing a user waiting for its replacement.
 */
export class EntityState {
  private personnel:Personnel;
  private configs?:Configurations;

  private constructor(personnel:Personnel, configs?:Configurations) {
    this.personnel = personnel;
    this.configs = configs;
  }

  public static getInstance = async (personnel:Personnel, configs?:Configurations) => {
    if(personnel.getUsers().length == 0) {
      personnel = await personnel.initialize();
    }
    return new EntityState(personnel, configs);
  }

  public isUnderStaffed = ():boolean => {
    return this.ASPVacancy() || this.AIVacancy();
  }

  public ASPVacancy = ():boolean => {
    const users = this.getUsers();
    const asps = users.filter(u => u.role == Roles.RE_ADMIN && u.active == YN.Yes);
    return asps.length < MINIMUM_ASPS;
  }

  public AIVacancy = (): boolean => {
    const users = this.getUsers();
    const aus = users.filter(u => u.role == Roles.RE_AUTH_IND && u.active == YN.Yes);
    return aus.length < MINIMUM_AIS;
  }
  
  /**
   * Determine if the entity has remained without the full complement of users for a specified role
   * for more than the allowed period of time.
   * @param role 
   * @param config 
   * @returns 
   */
  public exceededRoleVacancyTimeLimit = async (role:Role, config?:IAppConfig):Promise<boolean> => {
    const { getUsers, configs } = this;

    const getUpdatedISO = (user:User):string => {
      return (user.update_timestamp ?? user.create_timestamp) ?? new Date().toISOString()
    };

    const getCreatedISO = (user:User) => user.create_timestamp ?? new Date().toISOString();

    const getYoungerUser = (prior:User, current:User) => {
       if( ! prior) return current;
      const priorUpdated = new Date(getCreatedISO(prior)).getTime();
      const currentUpdated = new Date(getCreatedISO(current)).getTime();
      return currentUpdated > priorUpdated ? current : prior;
  }

    // Get the minimum number of users allowed for a role, below which constitutes a "vacancy".
    const minimum = role == Roles.RE_ADMIN ? MINIMUM_ASPS : MINIMUM_AIS;

    // Get the maximum amount of time a vacancy can be allowed for
    const { STALE_AI_VACANCY, STALE_ASP_VACANCY } = ConfigNames;
    const configName = role == Roles.RE_ADMIN ? STALE_ASP_VACANCY : STALE_AI_VACANCY;
    const maxVacancySeconds = config ?
      config.getDuration() :
      (await configs!.getAppConfig(configName)).getDuration();
    const maxVacancyTime = maxVacancySeconds * 1000;
    
    const users = getUsers().filter(u => u.role == role);

    // If the role is RE_AUTH_IND and no such users, base limit off the ASP create date
    if(users.length == 0 && role == Roles.RE_AUTH_IND) {
      const youngestActiveAsp = getUsers()
        .filter(u => u.role == Roles.RE_ADMIN && u.active == YN.Yes)
        .reduce(getYoungerUser);
      if(youngestActiveAsp) {
        const updated = new Date(getCreatedISO(youngestActiveAsp));
        return (Date.now() - updated.getTime()) >= maxVacancyTime;
      }        
      return true;
    }

    const activeUsers = users.filter(u => u.active === YN.Yes);
    const inactiveUsers = users.filter(u => u.active === YN.No);
    let activeCount = activeUsers.length;
    let validInactiveCount = 0;

    // Count active users and determine valid inactive users
    for(const user of inactiveUsers) {
      const deactivationTime = new Date(getUpdatedISO(user));
      if(Date.now() - deactivationTime.getTime() < maxVacancyTime) {
        validInactiveCount++; // Count inactive users that are within the allowed inactivity period
      }
    }

    // Check if the active or valid inactive count is below the minimum required
    if(activeCount + validInactiveCount < minimum) {
      // Since we know the count is below minimum, we need to find out when it started
      let belowMinimumSince: Date | undefined = undefined;

      for(const user of users) {
        if(user.active === YN.No) {
          const deactivationTime = new Date(getUpdatedISO(user));
          if( ! belowMinimumSince || deactivationTime < belowMinimumSince) {
            belowMinimumSince = deactivationTime; // Track the earliest deactivation time
          }
        }
      }

      if( ! belowMinimumSince) {
        // There were no deactivations, so select the most recent create_timestamp among the users.
        const youngest = getUsers().reduce(getYoungerUser);
        const created = youngest.create_timestamp ?? new Date().toISOString();
        belowMinimumSince = new Date(created);
      }

      // Check if duration constraint is violated
      if(belowMinimumSince && (Date.now() - belowMinimumSince.getTime() >= maxVacancyTime)) {
        return true;
      }
    }

    return false;
  }

  public getUsers = ():User[] => this.personnel.getUsers();

  public getEntity = ():Entity => this.personnel.getEntity();
}




/**
 * RUN MANUALLY: 
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/functions/authorized-individual/correction/EntityState.ts')) {

  (async () => {
    const ctx = await import('../../../../../contexts/context.json');
    ctx.CONFIG.useDatabase = false;
    let configs = new Configurations(ctx.CONFIG as CONFIG);

    const state = await EntityState.getInstance(new Personnel({ replacer: 'auth2.au.edu@warhen.work' }), configs);
    // log(state.getUsers());
    console.log(state.isUnderStaffed() ? 'understaffed' : 'staffed');

  })();
}