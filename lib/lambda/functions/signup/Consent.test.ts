import * as event from './ConsentEventMock.json';
import { Task, handler } from './Consent';
import { Entity, Invitation, Roles, User, YN } from '../../_lib/dao/entity';
import { ENTITY_WAITING_ROOM } from '../../_lib/dao/dao-entity';
import { LambdaProxyIntegrationResponse, OutgoingBody } from '../../../role/AbstractRole';
import exp = require('constants');

let goodCode:string;
let code = event.pathParameters['invitation-code'];
let dte = new Date().toISOString();
let alreadyAcknowledged:boolean = true;
let alreadyConsented:boolean = true;
const goodInvitationPayload = {
  entity_id: ENTITY_WAITING_ROOM,
  message_id: '0cea3257-38fd-4c24-a12f-fd731f19cae6',
  role: Roles.SYS_ADMIN,
  sent_timestamp: dte,
  entity_name: 'Boston University'
} as unknown as Invitation;

// Mock the es6 class for registration
jest.mock('../../_lib/invitation/Registration', () => {
  return {
    Registration: jest.fn().mockImplementation(() => {
      return {
        getInvitation: async (): Promise<Invitation|null> => {
          let retval = null;
          if(goodCode == code) {
            const payload = {
              code: goodCode, email: alreadyConsented ? bugs.email : goodCode
            } as Invitation
            Object.assign(payload, goodInvitationPayload);
            retval = payload;
            if(alreadyAcknowledged) {
              retval.acknowledged_timestamp = dte;
            }
            if(alreadyConsented) {
              retval.consented_timestamp = dte;

            }
          }
          return retval;
        },
        hasInvitation: async (): Promise<boolean> => {
          return true;
        },
        registerConsent: async (invitation:Invitation, timestamp?:string):Promise<boolean> => {
          return true;
        }
      };
    })
  };
});

const warnerbros = {
  entity_id: 'abc123', 
  description: 'Where the cartoon characters live',
  entity_name: 'Warner Bros.',
  active: YN.Yes,
  create_timestamp: dte,
  update_timestamp: dte
} as Entity
const bugs = {
  email: 'bugsbunny@warnerbros.com',
  entity_id: 'abc123',
  role: Roles.RE_AUTH_IND,
  sub: 'sub-abc-123',
  title: 'Cartoon Character',
  fullname: 'Bugs Bunny',
  phone_number: '+6175558888',
  create_timestamp: dte,
  update_timestamp: dte,
  active: YN.Yes
} as User
const daffy = {
  email: 'daffyduck@warnerbros.com',
  entity_id: 'abc123',
  role: Roles.RE_AUTH_IND,
  sub: 'sub-def-456',
  title: 'Cartoon Character',
  fullname: 'Daffy Duck',
  phone_number: '+5085558888',
  create_timestamp: dte,
  update_timestamp: dte,
  active: YN.No
} as User
/**
 * Create a partial mock for the dao.ts module
 */
jest.mock('../../_lib/dao/dao.ts', () => {
  return {
    __esModule: true,
    DAOFactory: {
      getInstance: jest.fn().mockImplementation(() => {
        return {
          read: async ():Promise<User|User[]> => {
            return [ daffy, bugs] as User[]
          }
        }
      })
    }
  }
});

jest.mock('../Utils.ts', () => {
  const originalModule = jest.requireActual('../Utils.ts');
  return {
    __esModule: true,
    ...originalModule,
    lookupSingleEntity: async (entity_id:string):Promise<Entity|null> => {
      return warnerbros;    
    }
  }
});  

type Expected = { statusCode:number, outgoingBody:OutgoingBody };
type TestParms = { 
  expectedResponse:Expected,
  task?:string,
  code?: string, 
  queryStringParameters?: any
  _handler:any
}
const invokeAndAssert = async (testParms:TestParms) => {
  // Destructure the testParms
  const { _handler, expectedResponse, task, code, queryStringParameters } = testParms;
  
  // Inject the supplied payload and attributes into the mock event object
  const mockEvent = {} as any;
  Object.assign(mockEvent, event);
  let pathParameters = {} as any;
  if(task)  pathParameters.task = task;
  if(code)  pathParameters['invitation-code'] = code;
  mockEvent.pathParameters = Object.entries(pathParameters).length == 0 ? null : pathParameters;
  mockEvent.queryStringParameters = Object.entries(queryStringParameters).length == 0 ? null : queryStringParameters;

  // Invoke the lambda function
  const response:LambdaProxyIntegrationResponse = await _handler(mockEvent);

  // Destructure the lambda function response
  const { statusCode, body } = response;
  const bodyObj = JSON.parse(body || '{}');
  const { message, payload:returnedPayload } = bodyObj;

  // Make all assertions
  const { message:expectedMessage, payload:expectedPayload} = expectedResponse.outgoingBody;
  expect(statusCode).toEqual(expectedResponse.statusCode);
  expect(message).toEqual(expectedMessage);
  expect(returnedPayload).toEqual(expectedPayload); 
  
  // Return the body of the response in case caller wants to make more assertions.
  return bodyObj;

}

describe('Consent lambda trigger: handler validation', () => {

  it('Should return 400 response with message if task is not specified', async () => {
    await invokeAndAssert({
      _handler:handler, code: 'abc123',
      queryStringParameters: {},
      expectedResponse: {
        statusCode: 400,
        outgoingBody: {
          message: `Bad Request: task not specified (${Object.values(Task).join('|')})`,
          payload: { invalid: true }
        } as OutgoingBody
      }
    });
  });

  it('Should return 400 response with message if task has an unexpected value', async () => {
    await invokeAndAssert({
      _handler:handler, code: 'abc123', task: 'bogus',
      queryStringParameters: {},
      expectedResponse: {
        statusCode: 400,
        outgoingBody: {
          message: `Bad Request: invalid task specified (${Object.values(Task).join('|')})`,
          payload: { invalid: true }
        } as OutgoingBody
      }
    });
  });

  it('Should return 401 response with message if no invitation code is included', async () => {
    await invokeAndAssert({
      _handler:handler, task: Task.LOOKUP_INVITATION,
      queryStringParameters: {},
      expectedResponse: {
        statusCode: 401,
        outgoingBody: {
          message: 'Unauthorized: Invitation code missing',
          payload: { unauthorized: true }
        } as OutgoingBody
      }
    });
  });  
});

describe(`Consent lambda trigger: handler ${Task.LOOKUP_INVITATION}`, () => {

  it('Should return 401 response with message with no payload if inivtation code is unmatchable', async () => {
    goodCode = 'good_code';
    await invokeAndAssert({
      _handler:handler, code, task: Task.LOOKUP_INVITATION,
      queryStringParameters: {},
      expectedResponse: {
        statusCode: 401,
        outgoingBody: {
          message: `Unauthorized: Unknown invitation code ${code}`,
          payload: { unauthorized: true }
        } as OutgoingBody
      }
    });
  });
  
  it('Should return a message_id in the payload if the invitation code is matched', async () => {
    goodCode = code;
    const expectedPayload = { ok: true, code, email:bugs.email, acknowledged_timestamp:dte, consented_timestamp:dte };
    Object.assign(expectedPayload, goodInvitationPayload);
    await invokeAndAssert({
      _handler:handler, code, task: Task.LOOKUP_INVITATION,
      queryStringParameters: {},
      expectedResponse: {
        statusCode: 200,
        outgoingBody: {
          message: `Ok`,
          payload: expectedPayload
        } as OutgoingBody
      }
    });
  });
});

describe(`Consent lambda trigger: handler ${Task.LOOKUP_ENTITY}`, () => {

  it('Should return 400 response with message if entity_id querystring parameter is missing', async () => {
    goodCode = code;
    await invokeAndAssert({
      _handler:handler, code, task: Task.LOOKUP_ENTITY,
      queryStringParameters: {},
      expectedResponse: {
        statusCode: 400,
        outgoingBody: {
          message: `Bad Request: Missing email entity_id parameter`,
          payload: { invalid: true }
        } as OutgoingBody
      }
    });
  });

  it('Should return 200 response with payload if entity_id querystring parameter is provided', async () => {
    goodCode = code;
    const expectedPayload = { ok: true };
    const expectedInvitation = Object.assign({}, goodInvitationPayload);
    expectedInvitation.acknowledged_timestamp = dte;
    expectedInvitation.consented_timestamp = dte;
    expectedInvitation.code = 'my_invitation_code2',
    expectedInvitation.email = bugs.email;
    Object.assign(expectedPayload, { entity:warnerbros, users:[ bugs ], invitation:expectedInvitation });
    await invokeAndAssert({
      _handler:handler, code, task: Task.LOOKUP_ENTITY,
      queryStringParameters: { entity_id: bugs.entity_id },
      expectedResponse: {
        statusCode: 200,
        outgoingBody: {
          message: `Ok`,
          payload: expectedPayload
        } as OutgoingBody
      }
    });
  });
});

describe(`Consent lambda trigger: handler ${Task.REGISTER}`, () => {

  it('Should NOT attempt to update if email querystring parameter is missing', async () => {
    goodCode = code;
    alreadyAcknowledged = true;
    alreadyConsented = false;
    await invokeAndAssert({
      _handler:handler, code, task: Task.REGISTER,
      queryStringParameters: { entity_id:bugs.entity_id, fullname:bugs.fullname },
      expectedResponse: {
        statusCode: 400,
        outgoingBody: {
          message: 'Bad Request: Missing email querystring parameter',
          payload: { invalid: true }
        } as OutgoingBody
      }
    });
  });

  it('Should NOT attempt to update if fullname querystring parameter is missing', async () => {
    goodCode = code;
    alreadyAcknowledged = true;
    alreadyConsented = false;
    await invokeAndAssert({
      _handler:handler, code, task: Task.REGISTER,
      queryStringParameters: { entity_id:bugs.entity_id, email:bugs.email },
      expectedResponse: {
        statusCode: 400,
        outgoingBody: {
          message: 'Bad Request: Missing fullname querystring parameter',
          payload: { invalid: true }
        } as OutgoingBody
      }
    });
  });
  
  it('Should NOT attempt to update the inviation if successfully found without existing acknowledgement', async () => {
    goodCode = code;
    alreadyAcknowledged = false;
    alreadyConsented = false;
    await invokeAndAssert({
      _handler:handler, code, task: Task.REGISTER,
      queryStringParameters: { entity_id:bugs.entity_id, email:bugs.email, fullname:bugs.fullname },
      expectedResponse: {
        statusCode: 401,
        outgoingBody: {
          message: 'Unauthorized: Privacy policy has not yet been acknowledged',
          payload: { unauthorized: true }
        } as OutgoingBody
      }
    });
  });
  
  it('Should NOT attempt to update the inviation if successfully found with existing consent', async () => {
    goodCode = code;
    alreadyAcknowledged = true;
    alreadyConsented = true;
    await invokeAndAssert({
      _handler:handler, code, task: Task.REGISTER,
      queryStringParameters: { entity_id:bugs.entity_id, email:bugs.email, fullname:bugs.fullname },
      expectedResponse: {
        statusCode: 200,
        outgoingBody: {
          message: `Ok: Already consented at ${dte}`,
          payload: { ok: true }
        } as OutgoingBody
      }
    });
  });
  
  it('Should attempt to update the inviation if successfully found needing consent', async () => {
    goodCode = code;
    alreadyAcknowledged = true;
    alreadyConsented = false;
    await invokeAndAssert({
      _handler:handler, code, task: Task.REGISTER,
      queryStringParameters: { entity_id:bugs.entity_id, email:bugs.email, fullname:bugs.fullname },
      expectedResponse: {
        statusCode: 200,
        outgoingBody: {
          message: `Ok: Consent registered for ${code}`,
          payload: { ok: true }
        } as OutgoingBody
      }
    });
    // and one more time with a title...
    await invokeAndAssert({
      _handler:handler, code, task: Task.REGISTER,
      queryStringParameters: { entity_id:bugs.entity_id, email:bugs.email, fullname:bugs.fullname, title:bugs.title },
      expectedResponse: {
        statusCode: 200,
        outgoingBody: {
          message: `Ok: Consent registered for ${code}`,
          payload: { ok: true }
        } as OutgoingBody
      }
    });
  });
});