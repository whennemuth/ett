## Lambda: `lib/lambda/functions/consenting-person/ConsentingPerson.ts`

### API Path

/consenting-person


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

#### `GET_CONSENTER`

- **Description:** Retrieve information about a consenter.
- Parameters:
  - `email` (string): Consenter's email address.

#### `GET_CONSENTER_FORMS`

- **Description:** Retrieve all exhibit forms associated with a consenter.
- Parameters:
  - `email` (string): Consenter's email address.

#### `REGISTER_CONSENT`

- **Description:** Register consent for a consenter.
- Parameters:
  - `email` (string): Consenter's email address.
  - `consent_signature` (string): Signature for consent.

#### `RENEW_CONSENT`

- **Description:** Renew consent for a consenter.
- Parameters:
  - `email` (string): Consenter's email address.
  - `consent_signature` (string): Signature for consent.

#### `RESCIND_CONSENT`

- **Description:** Rescind consent for a consenter.
- Parameters:
  - `email` (string): Consenter's email address.

#### `SEND_CONSENT`

- **Description:** Send a PDF copy of the consent form to the consenter.
- Parameters:
  - `email` (string): Consenter's email address.
  - `entityName` (string, optional): Name of the entity.

#### `CORRECT_CONSENTER`

- **Description:** Correct consenter details.
- Parameters:
  - `email` (string): Existing email address.
  - `new_email` (string): New email address.
  - `firstname` (string, optional): First name.
  - `middlename` (string, optional): Middle name.
  - `lastname` (string, optional): Last name.
  - `phone_number` (string, optional): Phone number.

#### `SAVE_EXHIBIT_FORM`

- **Description:** Save exhibit form data to the database.
- Parameters:
  - `email` (string): Consenter's email address.
  - `exhibit_data` (object): Exhibit form data.

#### `SEND_EXHIBIT_FORM`

- **Description:** Send full exhibit form to each authorized individual of the entity and save constituent forms to S3.
- Parameters:
  - `email` (string): Consenter's email address.
  - `exhibit_data` (object): Exhibit form data.

#### `CORRECT_EXHIBIT_FORM`

- **Description:** Correct exhibit form data for a previously submitted exhibit form.
- Parameters:
  - `email` (string): Consenter's email address.
  - `corrections` (object): Correction data for the exhibit form.

#### `GET_CORRECTABLE_AFFILIATES`

- **Description:** Get affiliates that can be corrected for a consenter and entity.
- Parameters:
  - `email` (string): Consenter's email address.
  - `entity_id` (string): Entity ID.

#### `PING`

- **Description:** Health check.
- Parameters:
  - Any parameters (echoed back).
