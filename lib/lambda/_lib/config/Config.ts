import { CONFIG } from "../../../../contexts/IContext";
import { log } from "../../Utils";
import { DAOConfig, DAOFactory } from "../dao/dao";
import { ConfigBatch } from "../dao/dao-config";
import { Config, ConfigName, ConfigNames, ConfigType, ConfigTypes } from "../dao/entity";

export enum DurationType {
  SECOND = 1,
  MINUTE = 60 * DurationType.SECOND,
  HOUR = 60 * DurationType.MINUTE,
  DAY = 24 * DurationType.HOUR,
}

export type IAppConfig = Config & {
  getDuration(as?:DurationType):number
}

/**
 * Decorator for a Config item for transforming config values.
 */
export class AppConfig implements IAppConfig {
  name: ConfigName;
  value: string;
  config_type: ConfigType;
  description: string;
  update_timestamp?: string | undefined;
  constructor(config:Config) {
    this.name = config.name;
    this.value = config.value;
    this.config_type = config.config_type;
    this.description = config.description;
    this.update_timestamp = config.update_timestamp
  }
  
  getDuration(_type:DurationType=DurationType.SECOND): number {
    const { value, config_type } = this;
    const parseDuration = (value:string):number => {
      const seconds = parseInt(value);
      return seconds/_type;
    }
    return config_type == ConfigTypes.DURATION ? parseDuration(value) : 0;
  }
}

/**
 * This class represents the application configuration. This is mostly comprised of numeric values
 * that indicate durations or timeouts after which certain events may occur as per business rules. 
 */
export class Configurations {

  static ENV_VAR_NAME:string = 'APP_CONFIGS';
  private config?:CONFIG;
  
  /**
   * Ingest the context-based configuration if provided (directly, or through an environment variable)
   * @param config 
   * @returns 
   */
  constructor(config?:CONFIG) {    
    if(config) {
      this.config = config;
      return;
    }
    const json = process.env[Configurations.ENV_VAR_NAME];
    if(json) {
      this.config = JSON.parse(json);
    }
  }

  /**
   * Get the entire app config as a json object. Useful for storing as an environment variable.
   * @returns 
   */
  public getJson = () => {
    const { config } = this;
    return config ? JSON.stringify(config): '{}';
  }

  /**
   * Get the app configuration. This will come as a result of a database lookup if the context specfies
   * to do this, else it will come directly from the context itself.
   * @returns 
   */
  public getAppConfigs = async ():Promise<IAppConfig[]> => {
    const { config, getDbConfig } = this ?? {};
    let { configs=[], useDatabase=false } = config ?? { configs:[] };
    let appConfigs:IAppConfig[];
    if(useDatabase) {
      let dbOutput = await getDbConfig() as Config[];
      dbOutput = dbOutput ?? [];
      if(dbOutput.length == 0) {
        log('Pre-populating database configurations...');
        // Pre-populate the table - this must be the first time it is being accessed after having been cloudformed.
        await this.setDbConfigs();
      }
      else {
        configs = dbOutput;
      }
    }
    appConfigs = configs.map((config:Config) => {
      return new AppConfig(config);
    });
    return appConfigs;
  }

  /**
   * Get a single item from the app configuration. This will come as a result of a database lookup if the context specfies
   * to do this, else it will come directly from the context itself.
   * @param name
   * @returns 
   */
  public getAppConfig = async (name:ConfigName):Promise<IAppConfig> => {
    const { config, getDbConfig } = this ?? {};
    let { configs=[], useDatabase=false } = config ?? { configs:[] };
    let _config:Config|undefined;
    if(useDatabase) {
      _config = await getDbConfig(name) as Config;
      if( ! _config) {
        let dbOutput = await getDbConfig() as Config[];
        dbOutput = dbOutput ?? [];
        if(dbOutput.length == 0) {
          log('Pre-populating database configurations...');
          // Pre-populate the table - this must be the first time it is being accessed after having been cloudformed.
          await this.setDbConfigs();
        }
        else {
          configs = dbOutput;
        }
        _config = configs.find((config:Config) => config.name == name);
      }
    }
    else {
      _config = configs.find((config:Config) => config.name == name);
    }
    return new AppConfig(_config ?? {} as IAppConfig);
  }

  /**
   * Transfer the config settings from the context into the config dynamodb table.
   * If the table already has content, then matching items will be overwritten.
   */
  public setDbConfigs = async ():Promise<void> => {
    const { configs } = this.config ?? {};
    await ConfigBatch().create(configs ?? []);
  }

  /**
   * Modify a single application configuration in the database.
   * @param config 
   */
  public setDbConfig = async (config:Config):Promise<void> => {
    const dao = DAOFactory.getInstance({ DAOType: "config", Payload: config });
    await dao.update();
  }

  /**
   * Return the entire contents of the config dynamodb table
   * @returns 
   */
  private getDbConfig = async (name?:string):Promise<(Config|null)|Config[]> => {
    const dao = DAOFactory.getInstance({ DAOType: "config", Payload: { name } as Config}) as DAOConfig;
    return dao.read();
  }
}

/**
 * RUN MANUALLY: 
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/config/Config.ts')) {
  (async () => {
    const ctx = await import('../../../../contexts/context.json');
    ctx.CONFIG.useDatabase = false;

    log("Test configurations from an object:")
    let configs = new Configurations(ctx.CONFIG as CONFIG);
    let appConfigs = await configs.getAppConfigs();
    log(appConfigs);
    let appConfig = await configs.getAppConfig(ConfigNames.DELETE_CONSENTER_AFTER);
    log(appConfig);

    log("\nTest configurations from an environment variable:")
    process.env[Configurations.ENV_VAR_NAME] = JSON.stringify(ctx.CONFIG);
    configs = new Configurations();
    appConfigs = await configs.getAppConfigs();
    log(appConfigs);
    appConfig = await configs.getAppConfig(ConfigNames.DELETE_CONSENTER_AFTER);
    log(appConfig);

    log("\nSaving config to database...");
    await configs.setDbConfigs();

    log("\nTest configurations from database lookup:")
    ctx.CONFIG.useDatabase = true;
    configs = new Configurations(ctx.CONFIG as CONFIG);
    appConfigs = await configs.getAppConfigs();
    log(appConfigs);
    appConfig = await configs.getAppConfig(ConfigNames.DELETE_CONSENTER_AFTER);
    log(appConfig);

  })();
}
