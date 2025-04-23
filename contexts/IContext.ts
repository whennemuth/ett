import { Config, ConfigNames } from "../lib/lambda/_lib/dao/entity";

export interface IContext {
  STACK_ID: string;
  ACCOUNT:  string;
  REGION:   string;
  LOCALHOST?: string;
  ETT_DOMAIN?: string;
  ETT_EMAIL_FROM?: string;
  CLOUDFRONT_DOMAIN?: string;
  CLOUDFRONT_CERTIFICATE?: string;
  REDIRECT_PATH_WEBSITE:string;
  REDIRECT_PATH_BOOTSTRAP:string;
  SYS_ADMIN_PATH:string;
  RE_ADMIN_PATH:string;
  RE_AUTH_IND_PATH:string;
  CONSENTING_PERSON_PATH:string;
  TERMS_OF_USE_PATH:string;
  PRIVACY_POLICY_PATH:string;
  DEFAULT_ROOT_OBJECT:string;
  CONFIG: CONFIG;
  TAGS:     Tags;
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
