## Pre-Registration:

Each path is preceded by the corresponding API URL, followed by an environment-specific path segment:
Example:

```
https://u4k2uilit9.execute-api.us-east-2.amazonaws.com/dev
```

where `"u4k2uilit9.execute-api.us-east-2.amazonaws.com"` identifies the API gateway resource, `"dev"` identifies the environment.

- #### `/acknowledge/{task}/{invitation-code}`

  Acknowledgment of privacy policy is recorded for a user by "marking" their invitation dynamodb record accordingly.

  - Allowed Methods: POST, GET, OPTIONS

  - Path Elements:

    - task: 

      - "lookup-invitation":
        Returns information about the invitation

        ```
        {
          "message": "Ok",
          "payload": {
            "ok": "true", {
              code: string,
              role: Role,
              email: string,
              entity_id: string,
              sent_timestamp: string,
              message_id: string,
              fullname?: string,
              title?: string,
              acknowledged_timestamp?: string,
              consented_timestamp?: string,
              retracted_timestamp?: string
            }
          }
        }
        ```

      - "register"
        Register acknowledgement of the privacy policy for the invited individual.
        Returns as follows:

        ```
        { "message": "Ok: Acknowledgement registered for [invitation-code]" }
        or...
        { "message": "Ok: Already acknowledged at [timestamp]" }
        ```

    - invitation-code:

  - Headers: NONE

- #### `/consent/{task}/{invitation-code}`

  Consent to the terms of ETT is recorded for a user by "marking" their invitation dynamodb record accordingly.

  - Allowed Methods: POST, GET, OPTIONS

  - Path Elements:

    - task

      - "lookup-invitation"
        Returns information about the invitation

        ```
        {
          "message": "Ok",
          "payload": {
            "ok": "true", {
              code: string,
              role: Role,
              email: string,
              entity_id: string,
              sent_timestamp: string,
              message_id: string,
              fullname?: string,
              title?: string,
              acknowledged_timestamp?: string,
              consented_timestamp?: string,
              retracted_timestamp?: string
            }
          }
        }
        ```

      - "lookup-entity"
        Returns details about the entity

        ```
        {
          "message": "Ok",
          "payload": {
          	"ok": "true", {
          	  entity_id: string,
              entity_name: string,
              description: string,
              create_timestamp?: string,
              update_timestamp?: string,
              active?: Y_or_N
          	}
          }
        }
        ```

      - "register"
        Register consent for the invited individual.
        Returns as follows:

        ```
        { "message": "Ok: Consent registered for [invitation-code]" }
        or...
        { "message": "Ok: Already consented at [timestamp]" }
        ```

      - "terminate"
        Delete the entity entirely. This results in:

        1. The removal of all invitations to the entity that were sent from the database.
        2. The removal of all users who belong to the entity from the database.
        3. The removal of the entity record itself from the database.
        4. The removal of every userpool entry associated with the entity from cognito

        Querystring Parameters:

        - notify: "true"*(default)*|"false"
          Indicates emailing each individual who was connected to the entity informing them of its deletion.

        Returns as follows, DeletionRecord:

        ```
        {
          "databaseCommandInput": {
            "TransactItems": [
              {
                "Delete": {
                  "TableName": "ett-users",
                  "Key": {
                    "entity_id": {
                      "S": "[entity-id]"
                    },
                    "email": {
                      "S": "[email-address]"
                    }
                  }
                }
              },
              more users...
              },
              {
                "Delete": {
                  "TableName": "ett-invitation",
                  "Key": {
                    "code": {
                      "S": "[invitation-code]"
                    }
                  }
                }
              },
              more invitations...
              {
                "Delete": {
                  "TableName": "ett-entities",
                  "Key": {
                    "entity_id": {
                      "S": "[entity-id]"
                    }
                  }
                }
              }
            ]
          },
          "deletedUsers": [
            {
              email: string,
              entity_id: string,
              sub: string,
              role: Role,
              fullname?: string,
              title?: string,
              phone_number?: string,
              create_timestamp?: string,
              update_timestamp?: string,
              active?: Y_or_N
            },
            more users...
          ]
        }
        ```

        