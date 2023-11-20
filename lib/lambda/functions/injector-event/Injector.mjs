/**
 * This function modifies content being loaded into the static website bucket so that certain placeholders are replaced 
 * with resource attribute values, like cognito userpool client attributes.
 */

import { S3 } from '@aws-sdk/client-s3'

const _s3 = new S3();

export const handler = async(event) => {

  console.log('------------------ EVENT ------------------')
  console.log(JSON.stringify(event, null, 2));
  console.log('-------------------------------------------')

  const { s3 } = event.Records[0];
  const { bucket, object } = s3;
  const key = decodeURIComponent(object.key);

  try {
    console.log(`Getting ${key}...`);
    const { Body } = await _s3.getObject({ Bucket: bucket.name, Key: key });
    const originalContent = await new Promise((resolve, reject) => {
      const chunks = [];
      Body.on('data', (chunk) => chunks.push(chunk));
      Body.on('end', () => resolve(Buffer.concat(chunks)));
      Body.on('error', reject);
    });
    console.log(`Replacing text...`);
    
    const content = originalContent.toString('utf-8');
    if(hasPlaceholder(content)) {
      /**
       * Take great care here: If you fail to replace the placeholder checked for by hasPlaceholder, 
       * an endless loop of putting the same file on top of itself in the bucket will result.
       */
      const newContent = originalContent.toString('utf-8')
        .replace(/STATIC_PARAMETERS_PLACEHOLDER/g, process.env.STATIC_PARAMETERS);
      console.log(`Putting ${key}...`);
      await _s3.putObject({ 
        Bucket: bucket.name, 
        Key: key, 
        ContentType: 'text/html',
        Body: newContent 
      });
    }
    else {
      console.log(`${key} has no placeholders. Cancelled.`);
    }
  } 
  catch (err) {
    console.error('Error converting/updating object:', err);
  }
}

const hasPlaceholder = content => {
  return content.includes('STATIC_PARAMETERS_PLACEHOLDER');
}

// SAMPLE EVENT:
// {
//   "Records": [
//       {
//           "eventVersion": "2.1",
//           "eventSource": "aws:s3",
//           "awsRegion": "us-east-2",
//           "eventTime": "2023-08-09T04:48:54.829Z",
//           "eventName": "ObjectCreated:Put",
//           "userIdentity": {
//               "principalId": "AWS:AROAQRUFG3X3A7QIXD6N6:wrh@bu.edu"
//           },
//           "requestParameters": {
//               "sourceIPAddress": "73.234.17.9"
//           },
//           "responseElements": {
//               "x-amz-request-id": "FYBJHQ7TAT6BXH63",
//               "x-amz-id-2": "Tl/x+rxqnjUCHTwI6uPbXbVJXkVDs0koKIgO+PCia3dSr/SWGUXQRFGsYE8xuG1v0RsCKS7yLrtS9qOPGVcljr59hH32kHok"
//           },
//           "s3": {
//               "s3SchemaVersion": "1.0",
//               "configurationId": "ZWYxNTAyNjgtZWU2ZS00MTllLWI1ODAtMjc4MDlmZWQ4MjU5",
//               "bucket": {
//                   "name": "ett-static-site-content",
//                   "ownerIdentity": {
//                       "principalId": "A1MBV5VYEBF19X"
//                   },
//                   "arn": "arn:aws:s3:::ett-static-site-content"
//               },
//               "object": {
//                   "key": "index.htm",
//                   "size": 15690,
//                   "eTag": "e7c226ce7413e94de089178ec63489da",
//                   "sequencer": "0064D31AB6B83A4CAC"
//               }
//           }
//       }
//   ]
// }
