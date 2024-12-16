import { Config, ConfigNames } from "../lib/lambda/_lib/dao/entity";

export interface IContext {
  SCENARIO: SCENARIO;
  STACK_ID: string;
  ACCOUNT:  string;
  REGION:   string;
  LOCALHOST?: string;
  ETT_DOMAIN?: string;
  CLOUDFRONT_DOMAIN?: string;
  CLOUDFRONT_CERTIFICATE?: string;
  REDIRECT_PATH_WEBSITE:string;
  REDIRECT_PATH_BOOTSTRAP:string;
  DEFAULT_ROOT_OBJECT:string;
  CONFIG: CONFIG;
  TAGS:     Tags;
}

export enum SCENARIO {
  DEFAULT = 'default',
  DYNAMODB = 'dynamodb',
}

export interface CONFIG {
  configs: Config[],
  useDatabase: boolean;
}

export interface Tags {
  Service:   string;
  Function:  string;
  Landscape: string;
}
