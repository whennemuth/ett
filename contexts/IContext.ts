export interface IContext {
  SCENARIO: SCENARIO;
  STACK_ID: string;
  ACCOUNT:  string;
  REGION:   string;
  BUCKET_NAME: string;
  BUCKET_OLAP?: boolean;
  CLOUDFRONT_DOMAIN: string;
  CLOUDFRONT_CERTIFICATE: string;
  SES_IDENTITIES: string[];
  TAGS:     Tags;
}

export enum SCENARIO {
  DEFAULT = 'default',
  DYNAMODB = 'dynamodb',
}

export interface Tags {
  Service:   string;
  Function:  string;
  Landscape: string;
}
