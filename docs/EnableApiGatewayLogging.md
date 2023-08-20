# Enable API Gateway to log to cloudwatch

API Gateway won't exist in an account having been granted permission to log to cloudwatch by default.
Therefore if you deploy the stack that sets up an API gateway configured to log to cloudwatch without accounting for this, you will see an error like this:

```
Resource handler returned message: "CloudWatch Logs role ARN must be set in account settings to enable logging (Service: ApiGateway, Status Code: 400, Request ID: 7436c8a1-607d-494b-a9cb-e451aad6655f)" (RequestToken: bc1a0db7-4808-fdce-11c6-b92fc875f1af, HandlerErrorCode: InvalidRequest)
```

The one-time, pre-deploy directions for setting this up are here:

[API Gateway: Permissions for CloudWatch logging](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-logging.html#set-up-access-logging-permissions)

The CLI command for setting up the role discussed in that article is as follow:

```
aws iam create-role \
  --role-name AmazonAPIGatewayPushToCloudWatchLogsRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "",
        "Effect": "Allow",
        "Principal": {
          "Service": "apigateway.amazonaws.com"
        },
        "Action": "sts:AssumeRole"
      }
    ]
  }'
```

Then attach the proper managed policy as follows:

```
aws iam attach-role-policy \
  --role-name AmazonAPIGatewayPushToCloudWatchLogsRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs
```

Lastly, Update the set the IAM role ARN on the [cloudWatchRoleArn](https://docs.aws.amazon.com/apigateway/latest/api/API_UpdateAccount.html#cloudWatchRoleArn) property on the [Account](https://docs.aws.amazon.com/apigateway/latest/api/API_GetAccount.html).
This must be done for each region you want this to apply to.
*(Don't forget to replace the example account number and region with appropriate values below)*

```
export AWS_REGION=us-east-2

aws apigateway update-account --patch-operations op='replace',path='/cloudwatchRoleArn',value='arn:aws:iam::037860335094:role/AmazonAPIGatewayPushToCloudWatchLogsRole'
```

