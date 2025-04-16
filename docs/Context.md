## Application Context

The context.json file is located inside the contexts directory at the root of the project and will contain all parameters that the CDK will use when generating the Cloudformation template it later deploys. Most of these parameters correspond to something one might otherwise use as values being supplied to Cloudformation if it were being invoked directly, but they will appear "hard-coded" in the stack template. [From CDK docs on parameters](https://docs.aws.amazon.com/cdk/v2/guide/parameters.html):

> *In general, we recommend against using AWS CloudFormation parameters with the AWS CDK. The usual ways to pass values into AWS CDK apps are [context values](https://docs.aws.amazon.com/cdk/v2/guide/context.html) and environment variables. Because they are not available at synthesis time, parameter values cannot be easily used for flow control and other purposes in your CDK app.*

```
{
  "STACK_ID": "ett",
  "ACCOUNT": "[Your account ID]",
  "REGION": "[Your desired region]",
  [ more config fields... ]
  "CONFIG": {
    "useDatabase": true,
    "configs": [
      { 
        "name": "auth-ind-nbr", 
        "value": "2",
        "config_type": "number",
        "description": "Number of authorized individuals per entity"
      },
      [ more configurations... ]
    ]
  },
  "TAGS": {
    "Service": "client",
    "Function": "ett",
    "Landscape": "dev"
  }
}
```



In a standard scenario, you would probably only adjust `ACCOUNT, REGION, TAGS.Landscape` from their default settings

The full list of context settings is as follows:

- **STACK_ID:** A short acronym that identifies the app. This value is incorporated *(in combination with `TAGS.Landscape`)* into the naming convention of all resources made/updated during stack creation/update operations.

- **ACCOUNT:** The [ID of the AWS account](https://docs.aws.amazon.com/IAM/latest/UserGuide/console-account-id.html) you are deploying ETT into.

- **REGION:** The [AWS Region](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.RegionsAndAvailabilityZones.html) you are deploying ETT into.

- **LOCALHOST:** Facilitates local development and deployment of ETT client apps by adding a localhost callback endpoint to the [Cognito redirect_uri](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html#:~:text=Amazon%20Cognito%20requires%20that%20your,such%20as%20myapp://example%20.). For example, a react front-end developer can run ETT locally against a backend whose stack was created with this value set to something like "http://localhost:5173". This would allow them to participate in a the oauth authentication flow and have their browser redirected back to localhost as the [oauth redirection endpoint](https://tools.ietf.org/html/rfc6749#section-3.1.2).  

- **ETT_EMAIL_FROM:** To invite a new school/university to participate in ETT, an email is sent by a system administrator to an individual who acts as an "Administrative Support Professional" (ASP/RE_ADMIN) for that institution. This value will be used as the from address for such emails.

- **ETT_DOMAIN:** The domain or subdomain for the ETT app. If this value is not supplied, the app defaults to the cloudfront default domain for reaching the app over http.

- **REDIRECT_PATH_BOOTSTRAP:** ETT is essentially a web service built out of lambda function. It is intended to be deployed in combination with a separate front-end/client app. However, a built in client app based on (Bootstrap)[https://getbootstrap.com/] comes "out-of-the-box" with the backend. This value serves as the path relative to the root for how you would reach this bootstrap front-end. It also informs building of [Cognito endpoints](https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints.html) specific to the bootstrap front-end.

- **REDIRECT_PATH_WEBSITE:** This is the path after ETT_DOMAIN that points to the root of the official front-end for ETT. This default to `"/"`

- **SYS_ADMIN_PATH:** Indicates the path to reach the dashboard for the system administrator. Default: `"/sysadmin"`

- **RE_ADMIN_PATH:** Indicates the path to reach the dashboard for the Administrative Support Professional (ASP/RE_ADMIN). Default:  `"/entity"`

- **RE_AUTH_IND_PATH:** Indicates the path to reach the dashboard for the Authorized Individual (AI/RE_AUTH_IND)". Default: `"/auth-ind"`

- **CONSENTING_PERSON_PATH:** Indicates the path to reach the dashboard for the Consenting Individual. Default: `"/consenting"`

- **TERMS_OF_USE_PATH:** Indicates the path to reach the terms of use policy page. Default: `"/terms"`

- **DEFAULT_ROOT_OBJECT:** Front-ends for ETT are intended to be single-page apps that are deployed as artifacts in an [S3 bucket](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingBucket.html). This bucket is set as an origin for the [Cloudfront distribution](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-working-with.html) that all requests must go through to reach the app. This value is specifically used in the [defaultRootObject](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-web-values-specify.html#DownloadDistValuesDefaultRootObject) attribute of that Cloudfront distribution. Default: `"index.html"`

- **CONFIG:** This entry is a collection of settings the app will use for reference when carrying out certain business rules. These are mostly duration or timeout thresholds. There is a **"useDatabase"** setting provided

  - "true": These configuration values will be loaded into a database table and the lambda functions that drive the app logic will obtain them from there. Also, the sysadmin user will be provided a tab that can be used to modify these values *(useful for testing - no stack update necessary)*.

  - "false": These configuration values are "hard-coded" into the lambda functions as a single json environment variable.
    Modification of any of the configurations would require one modifies the context.json file and perform a stack update.

  The full configuration listing is as follows:

  - **auth-ind-nbr:** Number of authorized individuals per entity

  - **first-reminder:** Duration between an initial disclosure request and the 1st automated reminder *(seconds)*

  - **second-reminder:** Duration between an initial disclosure request and the second automated reminder *(seconds)*

  - **delete-exhibit-forms-after:** Duration exhibit forms, once submitted, can survive in the ETT system before failure to send disclosure request(s) will result their deletion *(seconds)*

  - **delete-drafts-after:** Duration that partially complete exhibit forms can survive in the ETT system before failure to submit them will result in their deletion *(seconds)*
  - **delete-consenter-after:** Duration that a consenter can remain in the ETT system unconsented before being deleted *(seconds)*
  - **stale-ai-vacancy:** Duration beyond having a registered ASP that an entity can remain without a registered AI for before being terminated *(seconds)*
  - **stale-asp-vacancy:** Duration that an entity can remain without a registered ASP for before being terminated *(seconds)*

  - **consent-expiration:** Duration an individuals consent is valid for before it automatically expires *(seconds)*

