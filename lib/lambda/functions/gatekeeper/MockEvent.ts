import { AbstractRoleApi, IncomingPayload } from '../../../role/AbstractRole';

const mockPayload = {
    task: 'ping',
    parameters: {
      ping: true
    }
} as IncomingPayload;

export const mockEvent = {
  "resource": "/GATEKEEPER",
  "path": "/GATEKEEPER",
  "httpMethod": "GET", 
  "headers": {
      "Accept": "*/*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "en-US,en;q=0.9",
      "Authorization": "Bearer eyJraWQiOiIzbXNnQzFUMEFKSzJCaitrZ0k5S0Y5SHF6bWRSekRRYUFkZ04xK1pQSllVPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiI2YWMyZWYwOC04Zjg3LTQ2Y2ItOTMzMS01N2M3OTg4ODMzMjgiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAudXMtZWFzdC0yLmFtYXpvbmF3cy5jb21cL3VzLWVhc3QtMl9wQUhxZVpGMG0iLCJ2ZXJzaW9uIjoyLCJjbGllbnRfaWQiOiJhOTZjdWltdnY1Z2tzaWNwbGhhc2hra2NlIiwib3JpZ2luX2p0aSI6IjRjMTMxODY0LWVhMTYtNDYwYS1hMjBiLWZlZTZjMjQ0MjlhZCIsImV2ZW50X2lkIjoiYjZhOTA2ZmEtY2JhMi00ODU2LThiYzItMzQwMjljZTExNGJiIiwidG9rZW5fdXNlIjoiYWNjZXNzIiwic2NvcGUiOiJHQVRFS0VFUEVSXC9pbnZpdGF0aW9ucyBwaG9uZSBvcGVuaWQgcHJvZmlsZSBHQVRFS0VFUEVSXC9lbnRpdHktYWRtaW5pc3RyYXRpb24gZW1haWwiLCJhdXRoX3RpbWUiOjE3MDE3OTY5NzIsImV4cCI6MTcwMTg4MzM3MiwiaWF0IjoxNzAxNzk2OTcyLCJqdGkiOiJjZjQ0NWJiNC1iMmQ0LTRkNjQtOGE4Ny1iZmJkN2FjMzBjZGIiLCJ1c2VybmFtZSI6IjZhYzJlZjA4LThmODctNDZjYi05MzMxLTU3Yzc5ODg4MzMyOCJ9.ikQ2E_iD4XTZRpjHJPm1YafU2ltSjqRtmWMyfkx3DsJs3qSui6-7-kA7x-dd-SVfgLBagl8O3NC9GuizLElZLMxD4eYi1lXnFwm_ZKv9QhswHpyEkvjAkA8FAnATvQw56xBzf2gKLQUINqX9ReTf-GegDrKNHzIfAuGbnBZ4eije2TwgnOGlDDmvryiwZiF6awIPvTPRN_hOrBCQ9_kGAfyBu3GXIroftRTQw8we77kQCv-d332SZGbzju_mxaBPZ2yohcAm9Jl-YFTH-zhsBjlav5CPHeKQmPHmGP8Xw11QXfTAWBUxvupeSZLyeTufJAheqyIP1gBavnK3phbTXw",
      "cache-control": "no-cache",
      "CloudFront-Forwarded-Proto": "https",
      "CloudFront-Is-Desktop-Viewer": "true",
      "CloudFront-Is-Mobile-Viewer": "false",
      "CloudFront-Is-SmartTV-Viewer": "false",
      "CloudFront-Is-Tablet-Viewer": "false",
      "CloudFront-Viewer-ASN": "7922",
      "CloudFront-Viewer-Country": "US",
      "content-type": "application/json",
      "Host": "7a8hw62bke.execute-api.us-east-2.amazonaws.com",
      "origin": "https://dnkkwr06vb9yr.cloudfront.net",
      "pragma": "no-cache",
      "Referer": "https://dnkkwr06vb9yr.cloudfront.net/",
      "sec-ch-ua": "\"Google Chrome\";v=\"119\", \"Chromium\";v=\"119\", \"Not?A_Brand\";v=\"24\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "cross-site",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      "Via": "2.0 916143684fb2db26992ac8e86b83bf72.cloudfront.net (CloudFront)",
      "X-Amz-Cf-Id": "DXNViR8-cxpmG4cxB8OlnJqgdj6a6JE35gYNuRnxV4SCfqUC9CCbug==",
      "X-Amzn-Trace-Id": "Root=1-656f6180-1c255a5205c2363517bfa3b5",
      "X-Forwarded-For": "73.234.17.9, 15.158.52.112",
      "X-Forwarded-Port": "443",
      "X-Forwarded-Proto": "https",
      [AbstractRoleApi.ETTPayloadHeader]: JSON.stringify(mockPayload)
  },
  "multiValueHeaders": {
      "Accept": [
          "*/*"
      ],
      "Accept-Encoding": [
          "gzip, deflate, br"
      ],
      "Accept-Language": [
          "en-US,en;q=0.9"
      ],
      "Authorization": [
          "Bearer eyJraWQiOiIzbXNnQzFUMEFKSzJCaitrZ0k5S0Y5SHF6bWRSekRRYUFkZ04xK1pQSllVPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiI2YWMyZWYwOC04Zjg3LTQ2Y2ItOTMzMS01N2M3OTg4ODMzMjgiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAudXMtZWFzdC0yLmFtYXpvbmF3cy5jb21cL3VzLWVhc3QtMl9wQUhxZVpGMG0iLCJ2ZXJzaW9uIjoyLCJjbGllbnRfaWQiOiJhOTZjdWltdnY1Z2tzaWNwbGhhc2hra2NlIiwib3JpZ2luX2p0aSI6IjRjMTMxODY0LWVhMTYtNDYwYS1hMjBiLWZlZTZjMjQ0MjlhZCIsImV2ZW50X2lkIjoiYjZhOTA2ZmEtY2JhMi00ODU2LThiYzItMzQwMjljZTExNGJiIiwidG9rZW5fdXNlIjoiYWNjZXNzIiwic2NvcGUiOiJHQVRFS0VFUEVSXC9pbnZpdGF0aW9ucyBwaG9uZSBvcGVuaWQgcHJvZmlsZSBHQVRFS0VFUEVSXC9lbnRpdHktYWRtaW5pc3RyYXRpb24gZW1haWwiLCJhdXRoX3RpbWUiOjE3MDE3OTY5NzIsImV4cCI6MTcwMTg4MzM3MiwiaWF0IjoxNzAxNzk2OTcyLCJqdGkiOiJjZjQ0NWJiNC1iMmQ0LTRkNjQtOGE4Ny1iZmJkN2FjMzBjZGIiLCJ1c2VybmFtZSI6IjZhYzJlZjA4LThmODctNDZjYi05MzMxLTU3Yzc5ODg4MzMyOCJ9.ikQ2E_iD4XTZRpjHJPm1YafU2ltSjqRtmWMyfkx3DsJs3qSui6-7-kA7x-dd-SVfgLBagl8O3NC9GuizLElZLMxD4eYi1lXnFwm_ZKv9QhswHpyEkvjAkA8FAnATvQw56xBzf2gKLQUINqX9ReTf-GegDrKNHzIfAuGbnBZ4eije2TwgnOGlDDmvryiwZiF6awIPvTPRN_hOrBCQ9_kGAfyBu3GXIroftRTQw8we77kQCv-d332SZGbzju_mxaBPZ2yohcAm9Jl-YFTH-zhsBjlav5CPHeKQmPHmGP8Xw11QXfTAWBUxvupeSZLyeTufJAheqyIP1gBavnK3phbTXw"
      ],
      "cache-control": [
          "no-cache"
      ],
      "CloudFront-Forwarded-Proto": [
          "https"
      ],
      "CloudFront-Is-Desktop-Viewer": [
          "true"
      ],
      "CloudFront-Is-Mobile-Viewer": [
          "false"
      ],
      "CloudFront-Is-SmartTV-Viewer": [
          "false"
      ],
      "CloudFront-Is-Tablet-Viewer": [
          "false"
      ],
      "CloudFront-Viewer-ASN": [
          "7922"
      ],
      "CloudFront-Viewer-Country": [
          "US"
      ],
      "content-type": [
          "application/json"
      ],
      "Host": [
          "7a8hw62bke.execute-api.us-east-2.amazonaws.com"
      ],
      "origin": [
          "https://dnkkwr06vb9yr.cloudfront.net"
      ],
      "pragma": [
          "no-cache"
      ],
      "Referer": [
          "https://dnkkwr06vb9yr.cloudfront.net/"
      ],
      "sec-ch-ua": [
          "\"Google Chrome\";v=\"119\", \"Chromium\";v=\"119\", \"Not?A_Brand\";v=\"24\""
      ],
      "sec-ch-ua-mobile": [
          "?0"
      ],
      "sec-ch-ua-platform": [
          "\"Windows\""
      ],
      "sec-fetch-dest": [
          "empty"
      ],
      "sec-fetch-mode": [
          "cors"
      ],
      "sec-fetch-site": [
          "cross-site"
      ],
      "User-Agent": [
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
      ],
      "Via": [
          "2.0 916143684fb2db26992ac8e86b83bf72.cloudfront.net (CloudFront)"
      ],
      "X-Amz-Cf-Id": [
          "DXNViR8-cxpmG4cxB8OlnJqgdj6a6JE35gYNuRnxV4SCfqUC9CCbug=="
      ],
      "X-Amzn-Trace-Id": [
          "Root=1-656f6180-1c255a5205c2363517bfa3b5"
      ],
      "X-Forwarded-For": [
          "73.234.17.9, 15.158.52.112"
      ],
      "X-Forwarded-Port": [
          "443"
      ],
      "X-Forwarded-Proto": [
          "https"
      ]
  },
  "queryStringParameters": null,
  "multiValueQueryStringParameters": null,
  "pathParameters": null,
  "stageVariables": null,
  "requestContext": {
      "resourceId": "6xfrrj",
      "authorizer": {
          "claims": {
              "sub": "6ac2ef08-8f87-46cb-9331-57c798883328",
              "iss": "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_pAHqeZF0m",
              "version": "2",
              "client_id": "a96cuimvv5gksicplhashkkce",
              "origin_jti": "4c131864-ea16-460a-a20b-fee6c24429ad",
              "event_id": "b6a906fa-cba2-4856-8bc2-34029ce114bb",
              "token_use": "access",
              "scope": "GATEKEEPER/invitations phone openid profile GATEKEEPER/entity-administration email",
              "auth_time": "1701796972",
              "exp": "Wed Dec 06 17:22:52 UTC 2023",
              "iat": "Tue Dec 05 17:22:52 UTC 2023",
              "jti": "cf445bb4-b2d4-4d64-8a87-bfbd7ac30cdb",
              "username": "6ac2ef08-8f87-46cb-9331-57c798883328"
          }
      },
      "resourcePath": "/GATEKEEPER",
      "httpMethod": "GET",
      "extendedRequestId": "PewsJEtXiYcEk3Q=",
      "requestTime": "05/Dec/2023:17:44:32 +0000",
      "path": "/dev/GATEKEEPER",
      "accountId": "037860335094",
      "protocol": "HTTP/1.1",
      "stage": "dev",
      "domainPrefix": "7a8hw62bke",
      "requestTimeEpoch": 1701798272661,
      "requestId": "8080f0b2-318a-4d45-9ecb-1b0a967432d5",
      "identity": {
          "cognitoIdentityPoolId": null,
          "accountId": null,
          "cognitoIdentityId": null,
          "caller": null,
          "sourceIp": "73.234.17.9",
          "principalOrgId": null,
          "accessKey": null,
          "cognitoAuthenticationType": null,
          "cognitoAuthenticationProvider": null,
          "userArn": null,
          "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
          "user": null
      },
      "domainName": "7a8hw62bke.execute-api.us-east-2.amazonaws.com",
      "apiId": "7a8hw62bke"
  },
  "body": null,
  "isBase64Encoded": false
};