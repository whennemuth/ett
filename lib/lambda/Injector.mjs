

/**
 * This function modifies content coming out of the static website bucket so that certain placeholders are replaced 
 * with resource attribute values, like cognito userpool client attributes.
 */
export const handler = async(event) => {

  console.log('------------------ EVENT ------------------')
  console.log(JSON.stringify(event, null, 2));
  console.log('-------------------------------------------')
  console.log('----------------- CONTEXT -----------------')
  console.log(JSON.stringify(context, null, 2));
  console.log('-------------------------------------------')

  const request = event.Records[0].cf.request;
  const response = event.Records[0].cf.response;
  const headers = response.headers;

  response.body = JSON.stringify(event, null, 2);
  response.bodyEncoding = 'text';

  return response;
  




  // const htmlRequested = () => {
  //   if(headers['content-type'] && headers['content-type'][0].value.includes('text/html')) {
  //     console.log(`Html file ${request.uri} requested.`);
  //     return true;
  //   }
  //   return false;
  // }

  // const injectIntoIndexHtml = () => {
  //   console.log(`Processing ${request.uri}...`);
  //   const originalBody = response.body;
  //   const customHeaders = request.origin.custom.customHeaders;
  //   response.body = originalBody
  //     .replace(/CLIENT_ID_PLACEHOLDER/g, parms.clientId)
  //     .replace(/COGNITO_DOMAIN_PLACEHOLDER/g, parms.userPoolDomain)
  //     .replace(/USER_POOL_REGION_PLACEHOLDER/g, parms.userPoolRegion)
  //     .replace(/REDIRECT_URI_PLACEHOLDER/g, parms.userPoolRedirectUri)
  //     .replace(/HELLO_WORLD_API_URI_PLACEHOLDER/g, parms.helloWorldApiUri);
  //   headers['content-length'] = [{
  //     key: 'Content-Length', 
  //     value: response.body.length.toString() 
  //   }];
  // };

  // const getCustomHeaders = () => {
  //   var retval = null;
  //   const customHeaders = request.origin.custom.customHeaders;
  //   if(customHeaders) {
  //     // Assume that if there is no client ID header, then there are no custom headers at all.
  //     if(customHeaders['CLIENT_ID']) {
  //       retval = {
  //         clientId: customHeaders['CLIENT_ID'][0].value,
  //         userPoolRedirectUri: customHeaders['REDIRECT_URI'][0].value,
  //         userPoolRegion: customHeaders['USER_POOL_REGION'][0].value,
  //         userPoolDomain: customHeaders['COGNITO_DOMAIN'][0].value,
  //         helloWorldApiUri: customHeaders['HELLO_WORLD_API_URI'][0].value
  //       }
  //     }
  //   }
  //   console.log(JSON.stringify(retval, null, 2));
  //   return retval;
  // }

  // if(htmlRequested()) {  
  //   switch(request.uri) {
  //     case '/index.htm':
  //       injectIntoIndexHtml();
  //       break;
  //   }    
  // }

  // return response;
};
