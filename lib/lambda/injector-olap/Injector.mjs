

/**
 * This function modifies content coming out of the static website bucket so that certain placeholders are replaced 
 * with resource attribute values, like cognito userpool client attributes.
 */

import { S3 } from '@aws-sdk/client-s3'
import axios from 'axios';

const s3 = new S3();

export const handler = async(event) => {

  console.log('------------------ EVENT ------------------')
  console.log(JSON.stringify(event, null, 2));
  console.log('-------------------------------------------')

  const { getObjectContext, userIdentity } = event;
  const { outputRoute, outputToken, inputS3Url } = getObjectContext;
  const { invokedBy } = userIdentity;

  const injectValues = data => {
    // console.log(data);
    return data.replace(/CLIENT_ID_PLACEHOLDER/g, 'apples')
    .replace(/COGNITO_DOMAIN_PLACEHOLDER/g, 'oranges')
    .replace(/USER_POOL_REGION_PLACEHOLDER/g, 'pears')
    .replace(/REDIRECT_URI_PLACEHOLDER/g, 'bannanas')
    .replace(/HELLO_WORLD_API_URI_PLACEHOLDER/g, 'grapes');
  }
 
  if(invokedBy === 'cloudfront.amazonaws.com') {
    /**
     * Use axios so we can forward the request to s3 with the signature put on it by cloudfront (inputS3Url).
     * Cloudfront has policies that allow it to get objects from the bucket so the signature is based on those
     * credentials. If a policy were to be added to the bucket that gave s3:GetObject privileges to this function,
     * we could use s3.getObject instead of axios, which would put a signature in based on 
     * credentials derived from that functions policy.
     */
    const presignedResponse = await axios.get(inputS3Url);
    await s3.writeGetObjectResponse({
      RequestRoute: outputRoute,
      RequestToken: outputToken,
      StatusCode: presignedResponse.status,
      Body: injectValues(presignedResponse.data),
      ContentType: presignedResponse.headers['content-type']
    });
  }
  else {
    await s3.writeGetObjectResponse({
      RequestRoute: outputRoute,
      RequestToken: outputToken,
      StatusCode: 403,
      ErrorCode: "UserIdentityNotMissing",
      ErrorMessage: "The user identity of the request is not recognized.",
    });
  }
  
  return { statusCode: 200 };
  
};
