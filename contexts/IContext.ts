import { Config, ConfigNames } from "../lib/lambda/_lib/dao/entity";

export interface IContext {
  STACK_ID: string;
  ACCOUNT:  string;
  REGION:   string;
  LOCALHOST?: string;
  ETT_DOMAIN_CERTIFICATE_ARN?: string;
  ETT_DOMAIN?: string;
  ETT_EMAIL_FROM?: string;
  CLOUDFRONT_DOMAIN?: string;
  CLOUDFRONT_CERTIFICATE?: string;
  REDIRECT_PATH_WEBSITE:string;
  REDIRECT_PATH_BOOTSTRAP:string;
  DEFAULT_ROOT_OBJECT:string;
  CONFIG: CONFIG;
  PATHS: Paths;
  OUTSIDE_LINKS: OutsideLinks;
  TAGS:     Tags;
}

export interface Paths {
  SYS_ADMIN_PATH:string;
  RE_ADMIN_PATH:string;
  RE_AUTH_IND_PATH:string;
  CONSENTING_PERSON_PATH:string;
  CONSENTING_PERSON_REGISTRATION_PATH:string;
  TERMS_OF_USE_PATH:string;
  PRIVACY_POLICY_PATH:string;
  ENTITY_INVENTORY_PATH:string;
}

export interface OutsideLinks {
  SOCIETIES_CONSORTIUM_LINK: string;
  PREVENTION_LINK: string;
  REPORT_LINK: string;
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
