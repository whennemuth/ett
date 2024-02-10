import { OutgoingBody } from '../../../role/AbstractRole';
import { ENTITY_WAITING_ROOM } from '../../_lib/dao/dao-entity';
import { Invitation, Roles } from '../../_lib/dao/entity';
import { handler } from './Acknowledgement';
import * as event from './AcknowledgementEventMock.json';

let goodCode:string;
let code = event.pathParameters['invitation-code'];
let alreadyAcknowledged:boolean = true;
// Mock the es6 class for registration
jest.mock('../../_lib/invitation/Registration', () => {
  return {
    Registration: jest.fn().mockImplementation(() => {
      return {
        getInvitation: async (): Promise<Invitation|null> => {
          let retval = null;
          if(goodCode == code) {
            retval = {
              code: goodCode,
              email: goodCode,
              entity_id: ENTITY_WAITING_ROOM,
              message_id: '0cea3257-38fd-4c24-a12f-fd731f19cae6',
              role: Roles.SYS_ADMIN,
              sent_timestamp: new Date().toISOString(),
              entity_name: 'Boston University'
            } as Invitation;
            if(alreadyAcknowledged) {
              retval.acknowledged_timestamp = new Date().toISOString()
            }
          }
          return retval;
        },
        hasInvitation: async (): Promise<boolean> => {
          return true;
        },
        registerAcknowledgement: async (timestamp?:string):Promise<boolean> => {
          return true;
        }
      };
    })
  };
});

describe('Acknowledgement lambda trigger: handler', () => {

  it('Should return unauthorized status code and message if no invitation code is included', async () => {
    let noCodeEvent = {} as any;
    Object.assign(noCodeEvent, event);
    noCodeEvent.pathParameters = {};
    const response = await handler(noCodeEvent);
    expect(response.statusCode).toEqual(401);
    expect(response.body).toBeDefined()
    const body = JSON.parse(response.body);
    expect(body).toEqual({ 
      message: 'Unauthorized: Invitation code missing', 
      payload: { unauthorized:true } 
    } as OutgoingBody );
  });

  it('Should return unauthorized status code and message if inivtation code lookup does not return a match', async () => {
    goodCode = 'good_code';
    const response = await handler(event);
    expect(response.statusCode).toEqual(401);
    expect(response.body).toBeDefined();
    const body = JSON.parse(response.body);
    expect(body).toEqual({ 
      message: `Unauthorized: Unknown invitation code ${code}`,
      payload: { unauthorized:true }
    } as OutgoingBody);
  });

  it('Should NOT attempt to update the inviation if successfully found with existing acknowledgement', async () => {
    goodCode = code;
    const timestamp = new Date().toISOString();
    Date.prototype.toISOString = () => { return timestamp; }
    const response = await handler(event);
    expect(response.statusCode).toEqual(200);
    expect(response.body).toBeDefined();
    const body = JSON.parse(response.body);
    expect(body).toEqual({ 
      message: `Ok: Already acknowledged at ${timestamp}`,
      payload: { ok:true } 
    } as OutgoingBody);
  });

  it('Should attempt to update the inviation if successfully found unacknowledged', async () => {
    goodCode = code;
    alreadyAcknowledged = false;
    const timestamp = new Date().toISOString();
    Date.prototype.toISOString = () => { return timestamp; }
    const response = await handler(event);
    expect(response.statusCode).toEqual(200);
    expect(response.body).toBeDefined();
    const body = JSON.parse(response.body);
    expect(body).toEqual({ 
      message: `Ok: Acknowledgement registered for ${code}`,
      payload: { ok:true }
    } as OutgoingBody);
  });

});