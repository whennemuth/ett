import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { IContext } from "../../../../contexts/IContext";
import * as ctx from '../../../../contexts/context.json';

let bootstrapCache:string;
let websiteCache:string;

/**
 * This is a lambda@edge function for viewer request traffic to the ETT content bucket origin.
 * The purpose of this function is simply to intercept requests that match a specific uri and rewrite them to predefined value.
 * This way, more than one path can "point" to the same item in the origin bucket.
 */
export const handler =  async (event:any) => {

  try {
    const request = event.Records[0].cf.request;
    const uri = `${request.uri}`;
    const context:IContext = <IContext>ctx;
    const { TAGS: { Landscape }, REGION } = context;

    // Rewrite the request to the root index.htm if the path follows predefined patterns:
    if(uri.startsWith('/bootstrap/')) {
      if(uri.startsWith('/bootstrap/parameters/') || uri == '/bootstrap/parameters') {
        console.log(`Sending bootstrap parameters for incoming request uri: ${uri}`);
        const body = await getBootstrapParm(Landscape, REGION);
        return { status: 200, body }
      }
      // Assume that every item being requested resides at the root of the bucket, regardless of the uri path.
      request.uri = uri.substring(uri.lastIndexOf('/'), uri.length);
    }

    if(uri.startsWith('/parameters/') || uri == '/parameters') {
      console.log(`Sending bootstrap parameters for incoming request uri: ${uri}`);
      const body = await getWebsiteParm(Landscape, REGION);
      return { status: 200, body }
    }

    console.log(JSON.stringify({ 
      incomingURI: uri,
      outgoingURI: request.uri
    }, null, 2));
    
    return request;
  } 
  catch (e:any) {
    console.error(e);
    return {
      status: 501,
      body: `Viewer request lambda error: ${JSON.stringify(e, Object.getOwnPropertyNames(e), 2)}`
    }
  }
}

/**
 * Get a named parameter from the SSM parameter store.
 * @param Name 
 * @param region 
 * @returns 
 */
const getParameter = async (Name:string, region:string): Promise<string> => {
  try {
    const client = new SSMClient({ region });
    const input = { Name };
    const command = new GetParameterCommand(input);
    const response = await client.send(command);
    return response.Parameter?.Value ?? '{}';
  }
  catch(e) {
    console.error(e);
    return '{}'
  }
}

/**
 * Get the SSM parameter store value for the bootstrap app
 * @param landscape 
 * @param region 
 * @returns 
 */
const getBootstrapParm = async (landscape:string, region:string): Promise<string> => {
  if(bootstrapCache) {
    return bootstrapCache;
  }
  bootstrapCache = await getParameter(`/ett/${landscape}/bootstrap/static-site/parameters`, region);
  return bootstrapCache;
}

/**
 * Get the SSM parameter store value for the default website app
 * @param landscape 
 * @param region 
 * @returns 
 */
const getWebsiteParm = async (landscape:string, region:string): Promise<string> => {
  if(websiteCache) {
    return websiteCache;
  }
  websiteCache = await getParameter(`/ett/${landscape}/website/static-site/parameters`, region);
  return websiteCache;
}