import { Construct } from "constructs";
import { StaticSiteConstruct, StaticSiteConstructParms } from "../../../StaticSite";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { IContext } from "../../../../contexts/IContext";

export type ViewerRequestParameters = {
  bootstrap: StaticSiteConstructParms,
  website: StaticSiteConstructParms,
  context: IContext
}

export class ViewerRequestParametersConstruct extends Construct {
  constructId: string;
  scope: Construct;
  parms:ViewerRequestParameters;
      
  constructor(scope: Construct, constructId:string, parms:ViewerRequestParameters) {

    super(scope, constructId);

    const { context: { REDIRECT_PATH_BOOTSTRAP, REDIRECT_PATH_WEBSITE, TAGS: { Landscape } }, bootstrap, website } = parms;
    
    const { buildSiteParmObject } = StaticSiteConstruct;
    const bootstrapObj = buildSiteParmObject(bootstrap, REDIRECT_PATH_BOOTSTRAP);
    const websiteObj = buildSiteParmObject(website, REDIRECT_PATH_WEBSITE);

    // Needs to be > 4KB
    new StringParameter(this, 'BootstrapSiteParameters', {
      parameterName: `/ett/${Landscape}/bootstrap/static-site/parameters`,
      stringValue: JSON.stringify(bootstrapObj, null, 2),
    });

    // Needs to be > 4KB
    new StringParameter(this, 'WebstiteParameters', {
      parameterName: `/ett/${Landscape}/website/static-site/parameters`,
      stringValue: JSON.stringify(websiteObj, null, 2),
    });
  }
}
