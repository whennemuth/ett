## Lambda: `lib/lambda/functions/authorized-individual/AuthorizedIndividual.ts`

### API Path

/authorized-individual


### Payload Structure

This Lambda expects a JSON payload in the request header, specifically in the header key defined by `AbstractRoleApi.ETTPayloadHeader`.  
The payload should have the following structure:

```json
{
  "task": "<TASK_NAME>",
  "parameters": {
    // task-specific parameters
  }
}
```



### Supported Tasks and Parameters

#### `LOOKUP_USER_CONTEXT`

- **Description:** Lookup user context by email and role.
- Parameters:
  - `email` (string): User's email address.
  - `role` (string): User's role.

#### `DEMOLISH_ENTITY`

- **Description:** Demolish (delete) an entity, optionally as a dry run and/or with notification.
- Parameters:
  - `entity_id` (string): Entity ID.
  - `dryRun` (boolean, optional): If true, only simulate the demolition (default: false).
  - `notify` (boolean, optional): If true, notify users (default: true).

#### `SEND_EXHIBIT_FORM_REQUEST`

- **Description:** Send an exhibit form request to a consenter.
- Parameters:
  - `consenterEmail` (string): Consenter's email address.
  - `entity_id` (string): Entity ID.
  - `constraint` (string, optional): Constraint for the request.
  - `linkUri` (string, optional): Link URI for the exhibit form.
  - `lookback` (string, optional): Lookback period.
  - `positions` (any, optional): Positions data.

#### `SEND_DISCLOSURE_REQUEST`

- **Description:** Send a disclosure request to a consenter.
- Parameters:
  - `consenterEmail` (string): Consenter's email address.
  - `entity_id` (string): Entity ID.
  - `affiliateEmail` (string, optional): Affiliate's email address.

#### `GET_CONSENTERS`

- **Description:** Get a list of consenters, optionally filtered by a search fragment.
- Parameters:
  - `fragment` (string, optional): Search fragment.

#### `AMEND_ENTITY_NAME`

- **Description:** Amend the name of an entity.
- Parameters:
  - `entity_id` (string): Entity ID.
  - `name` (string): New entity name.

#### `AMEND_ENTITY_USER`

- **Description:** Amend user information for an entity.
- Parameters:
  - Task-specific user amendment fields.

#### `AMEND_REGISTRATION_COMPLETE`

- **Description:** Mark an entity registration amendment as complete.
- Parameters:
  - `amenderEmail` (string): Email of the amender.
  - `entity_id` (string): Entity ID.

#### `INVITE_USER`

- **Description:** Invite a user to an entity.
- Parameters:
  - `email` (string): Email of the user to invite.
  - `entity_id` (string): Entity ID.
  - `role` (string): Role to assign.
  - `registrationUri` (string): Registration URI.

#### `SEND_REGISTRATION`

- **Description:** Send a registration form to a user.
- Parameters:
  - `email` (string): Email of the user.
  - `role` (string): Role of the user.
  - `termsHref` (string): Link to terms of use.
  - `dashboardHref` (string): Link to dashboard.
  - `privacyHref` (string, optional): Link to privacy policy.

#### `RETRACT_INVITATION`

- **Description:** Retract an invitation.
- Parameters:
  - `code` (string): Invitation code.

#### `CORRECTION`

- **Description:** Correct user information.
- Parameters:
  - Task-specific correction fields.

#### `PING`

- **Description:** Health check.
- Parameters:
  - Any parameters (echoed back).
