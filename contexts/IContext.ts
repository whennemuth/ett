export interface IContext {
    SCENARIO: string;
    STACK_ID: string;
    ACCOUNT:  string;
    REGION:   string;
    BUCKET_NAME: string;
    CLOUDFRONT_DOMAIN: string;
    CLOUDFRONT_CERTIFICATE: string;
    TAGS:     Tags;
}

export interface Tags {
    Service:   string;
    Function:  string;
    Landscape: string;
}
