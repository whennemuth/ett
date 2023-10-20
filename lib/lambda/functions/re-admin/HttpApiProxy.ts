// To parse this data:
//
//   import { Convert, HTTPAPIProxy } from "./file";
//
//   const hTTPAPIProxy = Convert.toHTTPAPIProxy(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

export interface HTTPAPIProxy {
    version:               string;
    routeKey:              string;
    rawPath:               string;
    rawQueryString:        string;
    cookies:               string[];
    headers:               Headers;
    queryStringParameters: QueryStringParameters;
    requestContext:        RequestContext;
    body:                  string;
    pathParameters:        PathParameters;
    isBase64Encoded:       boolean;
    stageVariables:        StageVariables;
}

export interface Headers {
    ApiParameters: APIParameters;
    Header2:       string;
}

export interface APIParameters {
    email:       string;
    entity_name: string;
    role:        string;
    fullname:    string;
}

export interface PathParameters {
    parameter1: string;
}

export interface QueryStringParameters {
    parameter1: string;
    parameter2: string;
}

export interface RequestContext {
    accountId:      string;
    apiId:          string;
    authentication: Authentication;
    authorizer:     Authorizer;
    domainName:     string;
    domainPrefix:   string;
    http:           HTTP;
    requestId:      string;
    routeKey:       string;
    stage:          string;
    time:           string;
    timeEpoch:      number;
}

export interface Authentication {
    clientCert: ClientCERT;
}

export interface ClientCERT {
    clientCertPem: string;
    subjectDN:     string;
    issuerDN:      string;
    serialNumber:  string;
    validity:      Validity;
}

export interface Validity {
    notBefore: string;
    notAfter:  string;
}

export interface Authorizer {
    jwt: Jwt;
}

export interface Jwt {
    claims: Claims;
    scopes: string[];
}

export interface Claims {
    claim1: string;
    claim2: string;
}

export interface HTTP {
    method:    string;
    path:      string;
    protocol:  string;
    sourceIp:  string;
    userAgent: string;
}

export interface StageVariables {
    stageVariable1: string;
    stageVariable2: string;
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
    public static toHTTPAPIProxy(json: string): HTTPAPIProxy {
        return cast(JSON.parse(json), r("HTTPAPIProxy"));
    }

    public static hTTPAPIProxyToJson(value: HTTPAPIProxy): string {
        return JSON.stringify(uncast(value, r("HTTPAPIProxy")), null, 2);
    }
}

function invalidValue(typ: any, val: any, key: any, parent: any = ''): never {
    const prettyTyp = prettyTypeName(typ);
    const parentText = parent ? ` on ${parent}` : '';
    const keyText = key ? ` for key "${key}"` : '';
    throw Error(`Invalid value${keyText}${parentText}. Expected ${prettyTyp} but got ${JSON.stringify(val)}`);
}

function prettyTypeName(typ: any): string {
    if (Array.isArray(typ)) {
        if (typ.length === 2 && typ[0] === undefined) {
            return `an optional ${prettyTypeName(typ[1])}`;
        } else {
            return `one of [${typ.map(a => { return prettyTypeName(a); }).join(", ")}]`;
        }
    } else if (typeof typ === "object" && typ.literal !== undefined) {
        return typ.literal;
    } else {
        return typeof typ;
    }
}

function jsonToJSProps(typ: any): any {
    if (typ.jsonToJS === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.json] = { key: p.js, typ: p.typ });
        typ.jsonToJS = map;
    }
    return typ.jsonToJS;
}

function jsToJSONProps(typ: any): any {
    if (typ.jsToJSON === undefined) {
        const map: any = {};
        typ.props.forEach((p: any) => map[p.js] = { key: p.json, typ: p.typ });
        typ.jsToJSON = map;
    }
    return typ.jsToJSON;
}

function transform(val: any, typ: any, getProps: any, key: any = '', parent: any = ''): any {
    function transformPrimitive(typ: string, val: any): any {
        if (typeof typ === typeof val) return val;
        return invalidValue(typ, val, key, parent);
    }

    function transformUnion(typs: any[], val: any): any {
        // val must validate against one typ in typs
        const l = typs.length;
        for (let i = 0; i < l; i++) {
            const typ = typs[i];
            try {
                return transform(val, typ, getProps);
            } catch (_) {}
        }
        return invalidValue(typs, val, key, parent);
    }

    function transformEnum(cases: string[], val: any): any {
        if (cases.indexOf(val) !== -1) return val;
        return invalidValue(cases.map(a => { return l(a); }), val, key, parent);
    }

    function transformArray(typ: any, val: any): any {
        // val must be an array with no invalid elements
        if (!Array.isArray(val)) return invalidValue(l("array"), val, key, parent);
        return val.map(el => transform(el, typ, getProps));
    }

    function transformDate(val: any): any {
        if (val === null) {
            return null;
        }
        const d = new Date(val);
        if (isNaN(d.valueOf())) {
            return invalidValue(l("Date"), val, key, parent);
        }
        return d;
    }

    function transformObject(props: { [k: string]: any }, additional: any, val: any): any {
        if (val === null || typeof val !== "object" || Array.isArray(val)) {
            return invalidValue(l(ref || "object"), val, key, parent);
        }
        const result: any = {};
        Object.getOwnPropertyNames(props).forEach(key => {
            const prop = props[key];
            const v = Object.prototype.hasOwnProperty.call(val, key) ? val[key] : undefined;
            result[prop.key] = transform(v, prop.typ, getProps, key, ref);
        });
        Object.getOwnPropertyNames(val).forEach(key => {
            if (!Object.prototype.hasOwnProperty.call(props, key)) {
                result[key] = transform(val[key], additional, getProps, key, ref);
            }
        });
        return result;
    }

    if (typ === "any") return val;
    if (typ === null) {
        if (val === null) return val;
        return invalidValue(typ, val, key, parent);
    }
    if (typ === false) return invalidValue(typ, val, key, parent);
    let ref: any = undefined;
    while (typeof typ === "object" && typ.ref !== undefined) {
        ref = typ.ref;
        typ = typeMap[typ.ref];
    }
    if (Array.isArray(typ)) return transformEnum(typ, val);
    if (typeof typ === "object") {
        return typ.hasOwnProperty("unionMembers") ? transformUnion(typ.unionMembers, val)
            : typ.hasOwnProperty("arrayItems")    ? transformArray(typ.arrayItems, val)
            : typ.hasOwnProperty("props")         ? transformObject(getProps(typ), typ.additional, val)
            : invalidValue(typ, val, key, parent);
    }
    // Numbers can be parsed by Date but shouldn't be.
    if (typ === Date && typeof val !== "number") return transformDate(val);
    return transformPrimitive(typ, val);
}

function cast<T>(val: any, typ: any): T {
    return transform(val, typ, jsonToJSProps);
}

function uncast<T>(val: T, typ: any): any {
    return transform(val, typ, jsToJSONProps);
}

function l(typ: any) {
    return { literal: typ };
}

function a(typ: any) {
    return { arrayItems: typ };
}

function u(...typs: any[]) {
    return { unionMembers: typs };
}

function o(props: any[], additional: any) {
    return { props, additional };
}

function m(additional: any) {
    return { props: [], additional };
}

function r(name: string) {
    return { ref: name };
}

const typeMap: any = {
    "HTTPAPIProxy": o([
        { json: "version", js: "version", typ: "" },
        { json: "routeKey", js: "routeKey", typ: "" },
        { json: "rawPath", js: "rawPath", typ: "" },
        { json: "rawQueryString", js: "rawQueryString", typ: "" },
        { json: "cookies", js: "cookies", typ: a("") },
        { json: "headers", js: "headers", typ: r("Headers") },
        { json: "queryStringParameters", js: "queryStringParameters", typ: r("QueryStringParameters") },
        { json: "requestContext", js: "requestContext", typ: r("RequestContext") },
        { json: "body", js: "body", typ: "" },
        { json: "pathParameters", js: "pathParameters", typ: r("PathParameters") },
        { json: "isBase64Encoded", js: "isBase64Encoded", typ: true },
        { json: "stageVariables", js: "stageVariables", typ: r("StageVariables") },
    ], false),
    "Headers": o([
        { json: "ApiParameters", js: "ApiParameters", typ: r("APIParameters") },
        { json: "Header2", js: "Header2", typ: "" },
    ], false),
    "APIParameters": o([
        { json: "email", js: "email", typ: "" },
        { json: "entity_name", js: "entity_name", typ: "" },
        { json: "role", js: "role", typ: "" },
        { json: "fullname", js: "fullname", typ: "" },
    ], false),
    "PathParameters": o([
        { json: "parameter1", js: "parameter1", typ: "" },
    ], false),
    "QueryStringParameters": o([
        { json: "parameter1", js: "parameter1", typ: "" },
        { json: "parameter2", js: "parameter2", typ: "" },
    ], false),
    "RequestContext": o([
        { json: "accountId", js: "accountId", typ: "" },
        { json: "apiId", js: "apiId", typ: "" },
        { json: "authentication", js: "authentication", typ: r("Authentication") },
        { json: "authorizer", js: "authorizer", typ: r("Authorizer") },
        { json: "domainName", js: "domainName", typ: "" },
        { json: "domainPrefix", js: "domainPrefix", typ: "" },
        { json: "http", js: "http", typ: r("HTTP") },
        { json: "requestId", js: "requestId", typ: "" },
        { json: "routeKey", js: "routeKey", typ: "" },
        { json: "stage", js: "stage", typ: "" },
        { json: "time", js: "time", typ: "" },
        { json: "timeEpoch", js: "timeEpoch", typ: 0 },
    ], false),
    "Authentication": o([
        { json: "clientCert", js: "clientCert", typ: r("ClientCERT") },
    ], false),
    "ClientCERT": o([
        { json: "clientCertPem", js: "clientCertPem", typ: "" },
        { json: "subjectDN", js: "subjectDN", typ: "" },
        { json: "issuerDN", js: "issuerDN", typ: "" },
        { json: "serialNumber", js: "serialNumber", typ: "" },
        { json: "validity", js: "validity", typ: r("Validity") },
    ], false),
    "Validity": o([
        { json: "notBefore", js: "notBefore", typ: "" },
        { json: "notAfter", js: "notAfter", typ: "" },
    ], false),
    "Authorizer": o([
        { json: "jwt", js: "jwt", typ: r("Jwt") },
    ], false),
    "Jwt": o([
        { json: "claims", js: "claims", typ: r("Claims") },
        { json: "scopes", js: "scopes", typ: a("") },
    ], false),
    "Claims": o([
        { json: "claim1", js: "claim1", typ: "" },
        { json: "claim2", js: "claim2", typ: "" },
    ], false),
    "HTTP": o([
        { json: "method", js: "method", typ: "" },
        { json: "path", js: "path", typ: "" },
        { json: "protocol", js: "protocol", typ: "" },
        { json: "sourceIp", js: "sourceIp", typ: "" },
        { json: "userAgent", js: "userAgent", typ: "" },
    ], false),
    "StageVariables": o([
        { json: "stageVariable1", js: "stageVariable1", typ: "" },
        { json: "stageVariable2", js: "stageVariable2", typ: "" },
    ], false),
};
