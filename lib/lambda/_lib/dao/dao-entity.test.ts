import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { DAOFactory, DAOEntity } from './dao';
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { Entity, EntityFields, YN } from './entity';

const dbMockClient = mockClient(DynamoDBClient);

const entityId = '0cea3257-38fd-4c24-a12f-fd731f19cae6';
const dte = new Date().toISOString();
const dynamodbItem = {
  [EntityFields.entity_id]: { S: entityId },
  [EntityFields.entity_name]: { S: 'Boston University' },
  [EntityFields.description]: { S: 'BU description' },
  [EntityFields.active]: { S: YN.Yes },
  [EntityFields.create_timestamp]: { S: dte },
  [EntityFields.update_timestamp]: { S: dte },
};

const testPut = () => {
  describe('Dao entity create', () => {

    it('Should error if entity_name is missing', async () => {
      expect(async () => {
        const dao = DAOFactory.getInstance({
          DAOType: 'entity', Payload: {
            [EntityFields.description]: 'entity description'
          }
        }) as DAOEntity;
        await dao.create();
      }).rejects.toThrow(/Entity create error: Missing entity_name in/);
    });

    it('Should error if invalid Y/N value specified', () => {
      expect(() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'entity', Payload: {
            [EntityFields.entity_name]: 'Boston University',
            [EntityFields.active]: 'bogus'
        }});
      }).toThrow(/Entity crud error: Invalid Y\/N active field value specified in/);      
    });

    it('Should auto-generate an entity_id if none is provided', async () => {
      const dao = DAOFactory.getInstance({
        DAOType: 'entity', Payload: {
          [EntityFields.entity_name]: 'Boston University',
        }}) as DAOEntity;
      await dao.create();
      expect(dao.id()).toBeDefined();
    });

    it('Should use the entity_id that is provided', async () => {
      const dao = DAOFactory.getInstance({
        DAOType: 'entity', Payload: {
          [EntityFields.entity_id]: entityId,
          [EntityFields.entity_name]: 'Boston University',
      }}) as DAOEntity;
      await dao.create();
      expect(dao.id()).toEqual(entityId);
    });
  })
}

const testRead = () => {
  describe('Dao entity read', () => {

    it('Should error if entity_id is missing', async () => {
      expect(async () => {
        const dao = DAOFactory.getInstance({
          DAOType: 'entity', Payload: {
            [EntityFields.entity_name]: 'Boston University'
          }
        }) as DAOEntity;
        await dao.read();
      }).rejects.toThrow(/Entity read error: Missing entity_id in /)
    });

    it('Should return null if a non-existing entity_id is specified', async () => {
      const dao = DAOFactory.getInstance({
        DAOType: 'entity', Payload: {
          [EntityFields.entity_id]: 'bogus'
        }
      });
      dbMockClient.on(GetItemCommand).resolves({ ConsumedCapacity: {}});
      const output = await dao.read();
      expect(dbMockClient).toHaveReceivedCommandTimes(GetItemCommand, 1);
      expect(output).toBeNull();
    });

    it('Should return expected object if an existing entity_id is specified', async () => {
      const dao = DAOFactory.getInstance({
        DAOType: 'entity', Payload: {
          [EntityFields.entity_id]: entityId,
        }
      });
      dbMockClient.resetHistory();
      dbMockClient.on(GetItemCommand).resolves({ ConsumedCapacity: {}, Item: dynamodbItem });
      const output = await dao.read();
      expect(dbMockClient).toHaveReceivedCommandTimes(GetItemCommand, 1);
      expect(output).toHaveProperty(EntityFields.entity_id);
      const entity = output as Entity;
      expect(entity.entity_id).toEqual(entityId);
    });
  });
}

const testUpdate = () => {
  describe('Dao entity update', () => {

    it('Should error if entity_id is missing', async () => {
      expect(async() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'entity', Payload: {
            [EntityFields.entity_name]: 'Boston University',
        }});
        await dao.update();
      }).rejects.toThrow(/^Entity update error: Missing entity_id in/);
    });

    it('Should error if entity_id is the only field provided', async() => {
      expect(async() => {
        const dao = DAOFactory.getInstance({
          DAOType: 'entity', Payload: {
            [EntityFields.entity_id]: entityId,
        }});
        await dao.update();
      }).rejects.toThrow(/Entity update error: No fields to update for/);
    });

    it('Should update if matching entity_id found', async () => {
      dbMockClient.on(UpdateItemCommand).resolves({
        Attributes: dynamodbItem
      });
      const dao = DAOFactory.getInstance({
        DAOType: 'entity', Payload: {
          [EntityFields.entity_id]: entityId,
          [EntityFields.entity_name] : 'Boston University',
          [EntityFields.description]: 'New description'
      }});
      await dao.update();
      expect(dbMockClient).toHaveReceivedCommandTimes(UpdateItemCommand, 1);
    });

  })
}

const testDelete = () => {
  describe('Dao entity delete', () => {
    it('Should complete this test', () => {
      console.log('TBD');
    });
  });
}


testPut();

testRead();

testUpdate();

testDelete();