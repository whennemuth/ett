
/**
 * This is a lambda@edge function for viewer request traffic to the ETT content bucket origin.
 * The purpose of this function is simply to intercept requests that match a specific uri and rewrite them to predefined value.
 * This way, more than one path can "point" to the same item in the origin bucket.
  */
export const handler =  async (event:any) => {

  try {
    const request = event.Records[0].cf.request;
    const uri = `${request.uri}`;

    // Rewrite the request to the root index.htm if the path follows predefined patterns:
    if(uri.startsWith('/bootstrap/')) {
      // Assume that every item being requested resides at the root of the bucket, regardless of the uri path.
      request.uri = uri.substring(uri.lastIndexOf('/'), uri.length);
    }

    console.log(JSON.stringify({ 
      incomingURI: uri,
      outgoingURI: request.uri
    }, null, 2));
    
    return request;
  } 
  catch (e:any) {
    return {
      status: 501,
      body: `Viewer request lambda error: ${JSON.stringify(e, Object.getOwnPropertyNames(e), 2)}`
    }
  }
}