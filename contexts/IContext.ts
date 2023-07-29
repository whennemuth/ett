export interface IContext {
    SCENARIO: string;
    STACK_ID: string;
    ACCOUNT:  string;
    REGION:   string;
    TAGS:     Tags;
}

export interface Tags {
    Service:   string;
    Function:  string;
    Landscape: string;
}
