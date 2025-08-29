## Lambda: `lib/lambda/functions/re-admin/ReAdminUser.ts`

### API Path

/re-admin

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

#### `CREATE_ENTITY`

- **Description:** Create a new entity.
- Parameters:
  - `entity_name` (string): Name of the entity.
  - `description` (string): Description of the entity.

#### `UPDATE_ENTITY`

- **Description:** Update an existing entity.
- Parameters:
  - `entity_id` (string): Entity ID.
  - `entity_name` (string): Name of the entity.
  - `description` (string): Description of the entity.
  - `active` (string): Active status (e.g., "Y" or "N").

#### `DEACTIVATE_ENTITY`

- **Description:** Deactivate an entity.
- Parameters:
  - `entity<vscode_annotation details='%5B%7B%22title%22%3A%22hardcoded-credentials%22%2C%22description%22%3A%22Embedding%20credentials%20in%20source%20code%20risks%20unauthorized%20access%22%7D%5D'>_id</vscode_annotation>` (string): Entity ID.

#### `INVITE_USER`

- **Description:** Invite a single user.
- Parameters:
  - `email` (string): Email of the user to invite.
  - `entity_id` (string): Entity ID.
  - `role` (string): Role to assign.
  - `registrationUri` (string): Registration URI.

#### `INVITE_USERS`

- **Description:** Invite multiple users.

- Parameters:

  - `entity` (object): Entity details (may be ignored).

  - `invitations`

     (object):

    - `inviter` (object): `{ email, role }`
    - `invitee1` (object): `{ email, role }`
    - `invitee2` (object): `{ email, role }`

  - `registrationUri` (string): Registration URI.

#### `RETRACT_INVITATION`

- **Description:** Retract an invitation.
- Parameters:
  - `code` (string): Invitation code.

#### `SEND_REGISTRATION`

- **Description:** Send a registration form to a user.
- Parameters:
  - `email` (string): Email of the user.
  - `role` (string): Role of the user.
  - `termsHref` (string): Link to terms of use.
  - `dashboardHref` (string): Link to dashboard.
  - `privacyHref` (string, optional): Link to privacy policy.

#### `SEND_DISCLOSURE_REQUEST`

- **Description:** Send a disclosure request to a consenter.
- Parameters:
  - `consenterEmail` (string): Consenter's email address.
  - `entity_id` (string): Entity ID.
  - `affiliateEmail` (string, optional): Affiliate's email address.

#### `CORRECTION`

- **Description:** Correct user information.
- Parameters:
  - `entity_id` (string): Entity ID.
  - `email` (string): Existing email address.
  - `new_email` (string): New email address.
  - `role` (string): User's role.
  - `fullname` (string): Full name.
  - `title` (string): Title.
  - `phone_number` (string): Phone number.
  - `delegate` (object, optional): Delegate information.
