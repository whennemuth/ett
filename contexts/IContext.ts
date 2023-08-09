export interface IContext {
    SCENARIO: string;
    STACK_ID: string;
    ACCOUNT:  string;
    REGION:   string;
    BUCKET_NAME: string;
    BUCKET_OLAP?: boolean;
    CLOUDFRONT_DOMAIN: string;
    CLOUDFRONT_CERTIFICATE: string;
    TAGS:     Tags;
}

export interface Tags {
    Service:   string;
    Function:  string;
    Landscape: string;
}
