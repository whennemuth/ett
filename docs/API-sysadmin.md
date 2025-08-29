## Lambda: `lib/lambda/functions/sys-admin/SysAdminUser.ts`

### API Path

/sys-admin


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



### Supported SysAdmin Tasks and Parameters

#### `REPLACE_RE_ADMIN`

- **Description:** Replace the RE_ADMIN for an entity with another user.
- Parameters:
  - Task-specific replacement fields (not yet implemented).

#### `GET_DB_TABLE`

- **Description:** Retrieve the contents of a specified DynamoDB table in HTML form.
- Parameters:
  - `tableName` (string): Name of the DynamoDB table.

#### `GET_APP_CONFIGS`

- **Description:** Retrieve all application configurations.
- Parameters:
  - None.

#### `GET_APP_CONFIG`

- **Description:** Retrieve a single application configuration.
- Parameters:
  - `name` (string): Name of the configuration.

#### `SET_APP_CONFIG`

- **Description:** Modify a single application configuration.
- Parameters:
  - `name` (string): Name of the configuration.
  - `value` (string): Value to set.
  - `description` (string, optional): Description of the configuration.

#### `CLEAN_SHEET_OF_PAPER`

- **Description:** Wipe clean the system state (for testing or reset).
- Parameters:
  - None.

#### `GET_ENTITY_LIST`

- **Description:** Get a full listing of entities, both active and inactive.
- Parameters:
  - None.

#### `GET_CONSENTER_LIST`

- **Description:** Get a list of consenters.
- Parameters:
  - None.

#### `GET_CONSENTER_FORMS`

- **Description:** Get forms associated with a consenter.
- Parameters:
  - `email` (string): Consenter's email address.

#### `SHORTCUT_ENTITY_SETUP`

- **Description:** Create and staff an entity.
- Parameters:
  - `entityName` (string): Name of the entity.
  - `asp` (object): ASP user object.
  - `ais` (array): Array of AI user objects.

#### `SHORTCUT_ENTITY_TEARDOWN`

- **Description:** Teardown an entity.
- Parameters:
  - `entity_id` (string): Entity ID.

#### `SHORTCUT_CONSENTER_TEARDOWN`

- **Description:** Teardown a consenter.
- Parameters:
  - `email` (string): Consenter's email address.