### Post-Registration

Each path is preceded by the corresponding API URL, followed by an environment-specific path segment:
Example:

```
https://u4k2uilit9.execute-api.us-east-2.amazonaws.com/dev
```

where `"u4k2uilit9.execute-api.us-east-2.amazonaws.com"` identifies the API gateway resource *(each role gets its own such resource)* and `"dev"` identifies the environment.

- #### `/SYS_ADMIN`

  All tasks that can be performed by the role of system administrator

  - Allowed Methods: POST, GET, OPTIONS

  - Path elements: NONE

  - Headers:

    - "Authorization": `Bearer ${JWT Access Token}`

    - "Content-Type": "application/json"

    - "ettpayload":

      - Lookup a user and retrieve information about that user, including info about the entity the user belongs to and details about the other users who belong to that same entity.

        ```
        {
          "task": "lookup-user-context",
          "parameters": {
          	"email": string,
          	"role": string
          }
        }
        ```

        Returns:

        ```
        {
        
        }
        ```

      - Invite a user to an entity.

        ```
        {
          "task": "invite-user",
          "parameters": {
          	"email": string,
          	"role": string
          }
        }
        ```

        Returns:

        ```
        {
          "message": string,
          "parameters": {
            "ok": true,
            "invitation_code": string,
            "invitation_link": string
          }
        }
        
        # Where invitation_link resembles: "https://duqvs0kd8d3vj.cloudfront.net?action=acknowledge-entity&entity_id=__UNASSIGNED__&code=14e91df7-66a0-488a-b1ed-11da545c07bf"
        ```

      - Create an entity

        ```
        {
          "task": "create-entity",
          "parameters": {
          	"email": string,
          	"role": string
          }
        }
        ```

        Returns:

        ```
        {
        
        }
        ```

      - Update an entity

        ```
        {
          "task": "update-entity",
          "parameters": {
          
          }
        }
        ```

        Returns:

        ```
        {
        
        }
        ```

      - Deactivate an entity

        ```
        {
          "task": "",
          "parameters": {
          
          }
        }
        ```

        Returns:

        ```
        {
        
        }
        ```

        

- #### `/RE_ADMIN`

  All tasks that can be performed by the role of registered entity administrator

  - Allowed Methods: POST, GET, OPTIONS

  - Path elements: NONE

  - Headers:

    - "Authorization": `Bearer ${JWT Access Token}`

    - "Content-Type": "application/json"

    - "ettpayload":

      - Lookup a user and retrieve information about that user, including info about the entity the user belongs to and details about the other users who belong to that same entity.

        ```
        {
          "task": "lookup-user-context",
          "parameters": {
          	"email": string,
          	"role": string
          }
        }
        ```

        Returns:

        ```
        {
        
        }
        ```

        

- #### `/RE_AUTH_IND`

  All tasks that can be performed by the role of authorized individual

  - Allowed Methods: POST, GET, OPTIONS
  - Path elements: NONE
  - Headers:
    - "Authorization": `Bearer ${JWT Access Token}`
    - "Content-Type": "application/json"
    - "ettpayload":

- #### `/CONSENTING_PERSON`

  All tasks that can be performed by the role of consenting person

  - Allowed Methods: POST, GET, OPTIONS
  - Path elements: NONE
  - Headers:
    - "Authorization": `Bearer ${JWT Access Token}`
    - "Content-Type": "application/json"
    - "ettpayload":


