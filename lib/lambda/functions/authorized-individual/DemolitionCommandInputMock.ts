import { DynamoDbConstruct, TableBaseNames } from "../../../DynamoDb"

const { getTableName } = DynamoDbConstruct;
const { ENTITIES, USERS, INVITATIONS } = TableBaseNames;

export const expectedCommandInput = {
  "TransactItems": [
    {
      "Delete": {
        "TableName": `${getTableName(USERS)}`,
        "Key": {
          "entity_id": {
            "S": "mock_entity_id"
          },
          "email": {
            "S": "bugsbunny@warnerbros.com"
          }
        }
      }
    },
    {
      "Delete": {
        "TableName": `${getTableName(USERS)}`,
        "Key": {
          "entity_id": {
            "S": "mock_entity_id"
          },
          "email": {
            "S": "daffyduck@warnerbros.com"
          }
        }
      }
    },
    {
      "Delete": {
        "TableName": `${getTableName(USERS)}`,
        "Key": {
          "entity_id": {
            "S": "mock_entity_id"
          },
          "email": {
            "S": "yosemitesam@warnerbros.com"
          }
        }
      }
    },
    {
      "Delete": {
        "TableName": `${getTableName(INVITATIONS)}`,
        "Key": {
          "code": {
            "S": "abc123"
          }
        }
      }
    },
    {
      "Delete": {
        "TableName": `${getTableName(INVITATIONS)}`,
        "Key": {
          "code": {
            "S": "def456"
          }
        }
      }
    },
    {
      "Delete": {
        "TableName": `${getTableName(INVITATIONS)}`,
        "Key": {
          "code": {
            "S": "ghi789"
          }
        }
      }
    },
    {
      "Delete": {
        "TableName": `${getTableName(ENTITIES)}`,
        "Key": {
          "entity_id": {
            "S": "mock_entity_id"
          }
        }
      }
    }
  ]
}