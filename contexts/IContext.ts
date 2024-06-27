import { Config, ConfigNames } from "../lib/lambda/_lib/dao/entity";

export interface IContext {
  SCENARIO: SCENARIO;
  STACK_ID: string;
  ACCOUNT:  string;
  REGION:   string;
  BUCKET_NAME: string;
  CLOUDFRONT_DOMAIN?: string;
  CLOUDFRONT_CERTIFICATE?: string;
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
