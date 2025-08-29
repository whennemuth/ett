## Post-Registration

Each path is preceded by the default [API gateway published URL](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-publish.html) and [Stage](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-stages.stage-variables.html), followed by an environment-specific path segment:
Example:

```
https://u4k2uilit9.execute-api.us-east-2.amazonaws.com/dev
```

where `"u4k2uilit9.execute-api.us-east-2.amazonaws.com"` identifies the API gateway resource *(each role gets its own such resource)* and `"dev"` identifies the environment ([Stage](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-stages.stage-variables.html)).

- #### `/SYS_ADMIN`

  All tasks that can be performed by the role of system administrator

  - Allowed Methods: POST, GET, OPTIONS
- Path elements: NONE
  - Headers:

    - "Authorization": `Bearer ${JWT Access Token}`
- "Content-Type": "application/json"
    - "ettpayload": [payload](./API-sysadmin.md)

- #### `/RE_ADMIN`

  All tasks that can be performed by the role of registered entity administrator

  - Allowed Methods: POST, GET, OPTIONS
- Path elements: NONE
  - Headers:

    - "Authorization": `Bearer ${JWT Access Token}`
- "Content-Type": "application/json"
    - "ettpayload": [payload](./API-readmin.md)

- #### `/RE_AUTH_IND`

  All tasks that can be performed by the role of authorized individual

  - Allowed Methods: POST, GET, OPTIONS
  - Path elements: NONE
  - Headers:
    - "Authorization": `Bearer ${JWT Access Token}`
    - "Content-Type": "application/json"
    - "ettpayload": [payload](./API-authind.md)

- #### `/CONSENTING_PERSON`

  All tasks that can be performed by the role of consenting person

  - Allowed Methods: POST, GET, OPTIONS
  - Path elements: NONE
  - Headers:
    - "Authorization": `Bearer ${JWT Access Token}`
    - "Content-Type": "application/json"
    - "ettpayload": [payload](./API-consenter.md)

