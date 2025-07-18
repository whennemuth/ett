import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from "constructs";
import { IContext } from '../contexts/IContext';
import { AbstractRoleApi } from "./role/AbstractRole";

export interface StaticSiteConstructParms {
  bucket: Bucket,
  distributionId: string,
  cloudfrontDomain: string,
  primaryDomain: string,
  cognitoDomain: string,
  cognitoUserpoolRegion: string,
  registerEntityApiUri: string,
  registerConsenterApiUri: string,
  publicEntityInfoApiUris: string[],
  publicFormDownloadUris: string[],
  apis: AbstractRoleApi[]
}

/**
 * This is the boilerplate for the static site. It includes bucket creation and the uploading of an index file.
 * Subclasses will add functionality by implementing the customize function.
 */
export abstract class StaticSiteConstruct extends Construct {

  constructId: string;
  scope: Construct;
  context: IContext;
  bucket: Bucket;
  parms: StaticSiteConstructParms;
  
  constructor(scope: Construct, constructId: string, parms:StaticSiteConstructParms) {

    super(scope, constructId);

    this.scope = scope;
    this.constructId = constructId;
    this.parms = parms;
    this.context = scope.node.getContext('stack-parms');

    if(Object.entries(parms).length > 0) {
      this.customize();
    }
  }

  protected abstract customize(): void;

  public abstract getBucket(suffix?:string): Bucket;

  public abstract setBucketDeployment(dependOn?:Construct[]): void;

  /**
   * @param parms 
   * @returns A parameter object comprising all values client apps need to authenticate and talk with the backend.
   */
  public static buildSiteParmObject = (parms: StaticSiteConstructParms, redirectPath:string):any => {    
    const { cloudfrontDomain, primaryDomain } = parms;
    const domain = primaryDomain || cloudfrontDomain;

    if(redirectPath.startsWith('/')) {
      redirectPath = redirectPath.substring(1);
    }
    let jsonObj = {
      COGNITO_DOMAIN: parms.cognitoDomain,
      USER_POOL_REGION: parms.cognitoUserpoolRegion,
      PAYLOAD_HEADER: AbstractRoleApi.ETTPayloadHeader,
      REGISTER_ENTITY_API_URI: parms.registerEntityApiUri,
      REGISTER_CONSENTER_API_URI: parms.registerConsenterApiUri,
      PUBLIC_FORM_DOWNLOAD_URIS: parms.publicFormDownloadUris,
      PUBLIC_ENTITY_INFO_API_URIS: parms.publicEntityInfoApiUris,
      ROLES: { } as any
    };
    parms.apis.forEach((api:AbstractRoleApi) => {
      jsonObj.ROLES[api.getRole()] = {
        CLIENT_ID: api.getUserPoolClientId(),
        REDIRECT_URI: `https://${domain}/${redirectPath}`,
        API_URI: api.getRestApiUrl(),
        FULLNAME: api.getRoleFullName()
      }
    });
    return jsonObj;
  }
}