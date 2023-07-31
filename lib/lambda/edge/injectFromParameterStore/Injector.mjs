

/**
 * This function modifies content coming out of the static website bucket so that certain placeholders are replaced 
 * with resource attribute values, like cognito userpool client attributes.
 * 
 * NOTE: This is an ES module so top-level await can be used. This allows for use of the await keyword in the top
 * level of the file. With this feature, Node.js functions can complete asynchronous initialization code before
 * handler invocations, maximizing the effectiveness of Provisioned Concurrency as a mechanism for limiting cold start latency.
 * 
 * ADDITIONAL NOTE:
 * AWS provisions and manages the infrastructure required to run Lambda@Edge functions at the edge locations. 
 * This infrastructure is separate from the account's shared concurrency pool, and the Lambda@Edge functions do not 
 * utilize any of the unreserved concurrency that is available for regular Lambda functions. So, sadly, the above 
 * mentioned performance benefit would only occur when this changes, or there has been no cold start.
 */
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm"; 

const ssmParms = await getSsmParameters();

export const handler = async(event) => {
  const request = event.Records[0].cf.request;
  const response = event.Records[0].cf.response;
  const headers = response.headers;

  const htmlRequested = () => {
    if(headers['content-type'] && headers['content-type'][0].value.includes('text/html')) {
      console.log(`Html file ${request.uri} requested.`);
      return true;
    }
    return false;
  }

  const injectIntoIndexHtml = () => {
    console.log(`Processing ${request.uri}...`);
    const originalBody = response.body;
    response.body = originalBody
      .replace(/CLIENT_ID_PLACEHOLDER/g, ssmParms.clientId)
      .replace(/COGNITO_DOMAIN_PLACEHOLDER/g, ssmParms.userPoolDomain)
      .replace(/USER_POOL_REGION_PLACEHOLDER/g, ssmParms.userPoolRegion)
      .replace(/REDIRECT_URI_PLACEHOLDER/g, ssmParms.userPoolRedirectUri)
      .replace(/HELLO_WORLD_API_URI_PLACEHOLDER/g, ssmParms.helloWorldApiUri);
    headers['content-length'] = [{
      key: 'Content-Length', 
      value: response.body.length.toString() 
    }];
  };

  try {
    if(htmlRequested()) {  
      switch(request.uri) {
        case '/index.htm':
          injectIntoIndexHtml();
          break;
      }    
    }
  }
  catch(e) {
    console.error(e);
  }


  return response;
};

/**
 * @returns Required parameters from parameter store
 */
const getSsmParameters = async() => {

  const ssmClient = new SSMClient();

  console.log("Getting ssm parameters...");
  
  const clientId = await ssmClient.send(
    new GetParameterCommand({
      "Name": `/ett/${this.context.TAGS.Landscape}/userpool/CLIENT_ID` 
    })
  );  
  const userPoolRedirectUri = await ssmClient.send(
    new GetParameterCommand({
      "Name": `/ett/${this.context.TAGS.Landscape}/userpool/REDIRECT_URI` 
    })
  );  
  const userPoolRegion = await ssmClient.send(
    new GetParameterCommand({
      "Name": `/ett/${this.context.TAGS.Landscape}/userpool/USER_POOL_REGION` 
    })
  );  
  const userPoolDomain = await ssmClient.send(
    new GetParameterCommand({
      "Name": `/ett/${this.context.TAGS.Landscape}/userpool/COGNITO_DOMAIN` 
    })
  );  
  const helloWorldApiUri = await ssmClient.send(
    new GetParameterCommand({
      "Name": `/ett/${this.context.TAGS.Landscape}/userpool/HELLO_WORLD_API_URI` 
    })
  );

  const retval = {
    clientId, userPoolRedirectUri, userPoolRegion, userPoolDomain, helloWorldApiUri
  };
  console.log(JSON.stringify(retval, null, 2));
  return retval;
}