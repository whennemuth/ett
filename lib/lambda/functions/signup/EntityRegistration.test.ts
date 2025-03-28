import * as event from './EntityRegistrationEventMock.json';
import { Task, handler } from './EntityRegistration';
import { Entity, Invitation, Roles, User, YN } from '../../_lib/dao/entity';
import { ENTITY_WAITING_ROOM } from '../../_lib/dao/dao-entity';
import { LambdaProxyIntegrationResponse, OutgoingBody } from '../../../role/AbstractRole';
import exp = require('constants');

let goodCode:string;
let inviteToWaitingRoom = true;
let roleSubstitution:Roles|undefined;
let invitationCodeForEntityMismatch:string|undefined;
let code = event.pathParameters['invitation-code'];
let dte = new Date().toISOString();
let alreadyRegistered:boolean = true;
let entityNameAlreadyInUse = false;

const waitingroom = {
  entity_id: ENTITY_WAITING_ROOM, 
  description: ENTITY_WAITING_ROOM,
  entity_name: ENTITY_WAITING_ROOM,
  active: YN.Yes,
  create_timestamp: dte,
  update_timestamp: dte
} as Entity

const warnerbros = {
  entity_id: 'warnerbros', 
  description: 'Where the cartoon characters live',
  entity_name: 'warnerbros',
  active: YN.Yes,
  create_timestamp: dte,
  update_timestamp: dte
} as Entity

const bugs = {
  email: 'bugsbunny@warnerbros.com',
  entity_id: 'warnerbros',
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
  entity_id: 'warnerbros',
  role: Roles.RE_AUTH_IND,
  sub: 'sub-def-456',
  title: 'Cartoon Character',
  fullname: 'Daffy Duck',
  phone_number: '+5085558888',
  create_timestamp: dte,
  update_timestamp: dte,
  active: YN.No
} as User

// A mock of an invitation to the waiting room
const goodWaitingRoomInvitationPayload = {
  entity_id: ENTITY_WAITING_ROOM,
  entity_name: ENTITY_WAITING_ROOM,
  message_id: '0cea3257-38fd-4c24-a12f-fd731f19cae6',
  role: Roles.SYS_ADMIN,
  sent_timestamp: dte,
} as unknown as Invitation;

// A mock of an invitation to a real entity
const goodNonWaitingRoomInvitationPayload = {
  entity_id: warnerbros.entity_id,
  entity_name: warnerbros.entity_name,
  message_id: '0cea3257-38fd-4c24-a12f-fd731f19cae6',
  role: Roles.RE_ADMIN,
  sent_timestamp: dte,
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
              code: goodCode, email: alreadyRegistered ? bugs.email : goodCode
            } as Invitation

            Object.assign(payload, (inviteToWaitingRoom ? goodWaitingRoomInvitationPayload : goodNonWaitingRoomInvitationPayload));
            if(roleSubstitution) {
              payload.role = roleSubstitution;
            }

            retval = payload;
            if(alreadyRegistered) {
              retval.registered_timestamp = dte;
            }
          }
          if(invitationCodeForEntityMismatch == code) {
            const payload = {
              code: invitationCodeForEntityMismatch, email: alreadyRegistered ? bugs.email : invitationCodeForEntityMismatch
            } as Invitation
            Object.assign(payload, goodWaitingRoomInvitationPayload);
            payload.entity_id = 'unknown_entity_id';
            retval = payload;
          }
          
          return retval;
        },
        entityNameAlreadyInUse: async (entity_name:string): Promise<boolean> => {
          return entityNameAlreadyInUse;
        },
        hasInvitation: async (): Promise<boolean> => {
          return true;
        },
        registerUser: async (invitation:Invitation, timestamp?:string):Promise<boolean> => {
          return true;
        }
      };
    })
  };
});

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

jest.mock('../../Utils.ts', () => {
  const originalModule = jest.requireActual('../../Utils.ts');
  return {
    __esModule: true,
    ...originalModule,
    lookupSingleActiveEntity: async (entity_id:string):Promise<Entity|null> => {
      if(entity_id == waitingroom.entity_id) {
        return waitingroom;    
      }
      if(entity_id == warnerbros.entity_id || ! inviteToWaitingRoom) {
        return warnerbros;
      }
      return null;
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

describe('Entity Registration lambda trigger: handler validation', () => {

  it('Should return 400 response with message if task is not specified', async () => {
    await invokeAndAssert({
      _handler:handler, code: 'warnerbros',
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
      _handler:handler, code: 'warnerbros', task: 'bogus',
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

describe(`Entity Registration lambda trigger: handler ${Task.LOOKUP_INVITATION}`, () => {

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
    const expectedPayload = { ok: true, code, email:bugs.email, registered_timestamp:dte };
    Object.assign(expectedPayload, goodWaitingRoomInvitationPayload);
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

describe(`Entity Registration lambda trigger: handler ${Task.LOOKUP_ENTITY}`, () => {

  it('Should return 400 response with message entity cannot be determined from invitation lookup', async () => {
    goodCode = 'some_other_code';
    await invokeAndAssert({
      _handler:handler, code, task: Task.LOOKUP_ENTITY,
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

  it('Should return 400 response with message with no payload if lookup against invitation.entity_id does not return a match', async () => {
    invitationCodeForEntityMismatch = code;
    await invokeAndAssert({
      _handler:handler, code, task: Task.LOOKUP_ENTITY,
      queryStringParameters: {},
      expectedResponse: {
        statusCode: 400,
        outgoingBody: {
          message: `Invitation ${code} references an unknown entity: unknown_entity_id`,
          payload: { invalid: true }
        } as OutgoingBody
      }
    });
    invitationCodeForEntityMismatch = undefined;
  });

  it('Should return 200 response with payload if the entity is found from an invitation lookup', async () => {
    goodCode = code;
    inviteToWaitingRoom = false;
    const expectedPayload = { ok: true };
    const expectedInvitation = Object.assign({}, goodNonWaitingRoomInvitationPayload);
    expectedInvitation.registered_timestamp = dte;
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
  inviteToWaitingRoom = true;
});

describe(`Entity Registration lambda trigger: handler ${Task.REGISTER}`, () => {

  it('Should NOT attempt to update if email querystring parameter is missing', async () => {
    goodCode = code;
    alreadyRegistered = false;
    await invokeAndAssert({
      _handler:handler, code, task: Task.REGISTER,
      queryStringParameters: { 
        entity_id:bugs.entity_id, 
        fullname:bugs.fullname,
        entity_name: goodNonWaitingRoomInvitationPayload.entity_name
      },
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
    alreadyRegistered = false;
    await invokeAndAssert({
      _handler:handler, code, task: Task.REGISTER,
      queryStringParameters: { 
        entity_id:bugs.entity_id, 
        email:bugs.email,
        entity_name: goodNonWaitingRoomInvitationPayload.entity_name
      },
      expectedResponse: {
        statusCode: 400,
        outgoingBody: {
          message: 'Bad Request: Missing fullname querystring parameter',
          payload: { invalid: true }
        } as OutgoingBody
      }
    });
  });

  it('Should NOT attempt to update if both entity_name and entity_id querystring parameter is missing for RE_ADMIN', async () => {
    goodCode = code;
    alreadyRegistered = false;
    await invokeAndAssert({
      _handler:handler, code, task: Task.REGISTER,
      queryStringParameters: { email:bugs.email, fullname:bugs.fullname, title:bugs.title },
      expectedResponse: {
        statusCode: 400,
        outgoingBody: {
          message: 'Bad Request: Missing entity_name querystring parameter',
          payload: { invalid: true }
        } as OutgoingBody
      }
    });
  });
  
  it('Should NOT attempt to update the invitation if successfully found with existing registration', async () => {
    
    goodCode = code;
    alreadyRegistered = true;
    await invokeAndAssert({
      _handler:handler, code, task: Task.REGISTER,
      queryStringParameters: { 
        entity_id:bugs.entity_id, 
        email:bugs.email, 
        fullname:bugs.fullname, 
        entity_name: goodNonWaitingRoomInvitationPayload.entity_name
      },
      expectedResponse: {
        statusCode: 200,
        outgoingBody: {
          message: `Ok: Registration completed for ${event.pathParameters['invitation-code']}`,
          payload: { ok: true }
        } as OutgoingBody
      }
    });
  });

  it('Should NOT attempt to update the registration if successfully found, but would collide with existing entity', async () => {
    goodCode = code;
    alreadyRegistered = false;
    entityNameAlreadyInUse = true;
    inviteToWaitingRoom = false;

    await invokeAndAssert({
      _handler:handler, code, task: Task.REGISTER,
      queryStringParameters: { 
        entity_id:undefined, // Make sure this is undefined
        email:bugs.email, 
        fullname:bugs.fullname, 
        entity_name: goodNonWaitingRoomInvitationPayload.entity_name
      },
      expectedResponse: {
        statusCode: 400,
        outgoingBody: {
          message: `Bad Request: The specified name: "${warnerbros.entity_name}", is already in use.`,
          payload: { invalid: true }
        } as OutgoingBody
      }
    });
    
    roleSubstitution = Roles.RE_AUTH_IND;
    await invokeAndAssert({
      _handler:handler, code, task: Task.REGISTER,
      queryStringParameters: { 
        entity_id:bugs.entity_id, 
        email:bugs.email, 
        fullname:bugs.fullname, 
        entity_name: goodNonWaitingRoomInvitationPayload.entity_name
      },
      expectedResponse: {
        statusCode: 200,
        outgoingBody: {
          message: `Ok: Registration completed for ${code}`,
          payload: { ok: true }
        } as OutgoingBody
      }
    });
    roleSubstitution = undefined;
    inviteToWaitingRoom = true;
  });
  
  it('Should attempt to update the invitation if successfully found needing registration', async () => {
    goodCode = code;
    alreadyRegistered = false;
    entityNameAlreadyInUse = false;
    await invokeAndAssert({
      _handler:handler, code, task: Task.REGISTER,
      queryStringParameters: { 
        entity_id:bugs.entity_id, 
        email:bugs.email, 
        fullname:bugs.fullname, 
        entity_name: goodNonWaitingRoomInvitationPayload.entity_name
      },
      expectedResponse: {
        statusCode: 200,
        outgoingBody: {
          message: `Ok: Registration completed for ${code}`,
          payload: { ok: true }
        } as OutgoingBody
      }
    });
    // and one more time with a title...
    await invokeAndAssert({
      _handler:handler, code, task: Task.REGISTER,
      queryStringParameters: { 
        entity_id:bugs.entity_id, 
        email:bugs.email, 
        fullname:bugs.fullname, 
        entity_name: goodNonWaitingRoomInvitationPayload.entity_name,
        title:bugs.title, 
      },
      expectedResponse: {
        statusCode: 200,
        outgoingBody: {
          message: `Ok: Registration completed for ${code}`,
          payload: { ok: true }
        } as OutgoingBody
      }
    });
  });
});