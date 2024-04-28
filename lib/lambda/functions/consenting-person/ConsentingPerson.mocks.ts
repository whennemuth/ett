import { mock } from "node:test";
import { IncomingPayload, OutgoingBody } from "../../../role/AbstractRole";
import { DAOEntity, DAOInvitation, DAOUser, FactoryParms } from "../../_lib/dao/dao";
import { AffiliateTypes, Entity, Roles, User, YN } from "../../_lib/dao/entity";
import { Affiliate, ExhibitData } from "../../_lib/pdf/ExhibitForm";
import { MockCalls, TestParms, invokeAndAssert } from "../UtilsTest";
import { FormType, FormTypes } from "./ExhibitEmail";

/**
 * Keeps track of how many times any method of any mock has been called.
 */
const mockCalls = new MockCalls();

const deepClone = (obj:any) => JSON.parse(JSON.stringify(obj));

/**
 * Define a mock for the es6 ExhibitEmail class
 * @returns 
 */
export function ExhibitEmailMock() {
  return {
    ExhibitEmail: jest.fn().mockImplementation((data:ExhibitData, formType:FormType, entity:Entity) => {
      return {
        send: async (email:string):Promise<boolean> => {
          mockCalls.update(`email.send`);
          mockCalls.update(`email.send.${formType}.${email}`);
          return email != BAD_EXHIBIT_RECIPIENT_EMAIL;
        }
      }
    })
  }
}

/**
 * Define a mock for the es6 DAOFactory class
 */
export const ERROR_MESSAGE = 'Test error, assert proper handling';
export const BAD_ENTITY_ID1 = 'bad_entity1'; // Error when looking up entity
export const BAD_ENTITY_ID2 = 'bad_entity2'; // Error when looking up users in the entity
export const BAD_ENTITY_ID3 = 'bad_entity3'; // Error when sending and email to one of the users of the entity.
export const BAD_EXHIBIT_RECIPIENT_EMAIL = 'error@warnerbros.org'
export const entity1 = { entity_id:'warnerbros', entity_name: 'Warner Bros.', active: YN.Yes } as Entity;
export const daffyduck = { email: 'daffyduck@warnerbros.com', entity_id: entity1.entity_id, role: Roles.RE_ADMIN, active: YN.Yes } as User;
export const porkypig = { email: 'porkypig@warnerbros.com', entity_id: entity1.entity_id, role: Roles.RE_AUTH_IND, active: YN.Yes } as User;
export const bugsbunny = { email: 'bugs@warnerbros.com', entity_id: entity1.entity_id, role: Roles.RE_AUTH_IND, active: YN.Yes } as User;
export const badUser = { email: BAD_EXHIBIT_RECIPIENT_EMAIL, entity_id: entity1.entity_id, role:Roles.RE_AUTH_IND, active: YN.Yes } as User;
export const foghorLeghorn = { email: 'foghorn@looneyTunes.com', type: AffiliateTypes.ACADEMIC, fullname: 'Foghorn Leghorn', organization: 'Looney Tunes', phone: '781-444-6666', title:'Head Rooster' } as Affiliate;
export const wileECoyote = { email: 'coyote@acme.com', type: AffiliateTypes.EMPLOYER, fullname: 'Wile E. Coyote', organization: 'ACME', phone: '617-333-5555', title:'Acme. tester' } as Affiliate;
export const affiliates = [ foghorLeghorn, wileECoyote ] as Affiliate[];
export function DaoMock(originalModule: any) {
  return {
    __esModule: true,
    ...originalModule,
    DAOFactory: {
      getInstance: jest.fn().mockImplementation((parms:FactoryParms) => {
        let { email, entity_id } = parms.Payload;
        switch(parms.DAOType) {
          case "entity":
            return {
              read: async ():Promise<Entity|null> => {
                mockCalls.update(`entity.read`);
                mockCalls.update(`entity.read.${entity_id}`);
                if(entity_id == BAD_ENTITY_ID1) {
                  throw new Error(ERROR_MESSAGE)
                }       
                return entity1;
              },
            } as DAOEntity;
          case "user":
            return {
              read: async ():Promise<User|User[]> => {
                mockCalls.update(`user.read`); 
                mockCalls.update(`user.read.${email}`);
                const users = [ daffyduck, porkypig, bugsbunny ] as User[];
                switch(entity_id) {
                  case BAD_ENTITY_ID2:
                    throw new Error(ERROR_MESSAGE);
                  case BAD_ENTITY_ID3:
                    // Replace porky pig with bad user
                    users[users.findIndex((u:User) => u.email == porkypig.email)] = badUser;
                    return users;
                  default:
                    return users;               
                }
              }
            } as DAOUser            
          case "invitation":
            mockCalls.update('invitation.read');
            return {} as DAOInvitation;
        }
      })
    }
  }
}

/**
 * Define the lambda function parameter validation tests.
 */
export const ParameterValidationTests = {
  pingTest: async (_handler:any, eventMock:any, task:string) => {
    await invokeAndAssert({
      expectedResponse: { 
        statusCode: 200, 
        outgoingBody:{ message: 'Ping!', payload: { ok:true, ping:true }} as OutgoingBody 
      },
      _handler, mockEvent: eventMock,
      incomingPayload: { task, parameters: { ping: true } } as IncomingPayload
    });  
  },
  missingPayload: async (_handler:any, eventMock:any, task:string, message:string) => {
    await invokeAndAssert({
      expectedResponse: {
        statusCode: 400, 
        outgoingBody: { 
          message, 
          payload: { invalid: true  }
        }
      }, 
      _handler, mockEvent: eventMock,
      incomingPayload: { task } as IncomingPayload
    });
  },
  bogusTask: async (_handler:any, eventMock:any, task:string, message:string) => {
    await invokeAndAssert({
      expectedResponse: {
        statusCode: 400,
        outgoingBody: { 
          message,
          payload: { invalid: true  }
        }
      }, 
      _handler, mockEvent: eventMock,
      incomingPayload: { task } as IncomingPayload      
    })
  }
}

/**
 * Define the lambda function exhibit form submission tests.
 */
export const SendAffiliateData = {
  missingExhibitData: async(_handler:any, mockEvent:any, task:string, message:string) => {
    await invokeAndAssert({
      expectedResponse: {
        statusCode: 400,
        outgoingBody: {
          message,
          payload: { invalid: true }
        }
      },
      _handler, mockEvent,
      incomingPayload: { task, parameters: { randomProperty: 'random' } } as IncomingPayload
    })
  },
  missingAffiliateRecords: async(_handler:any, mockEvent:any, task:string, message:string) => {
    await invokeAndAssert({
      expectedResponse: {
        statusCode: 400,
        outgoingBody: {
          message,
          payload: { invalid: true }
        }
      },
      _handler, mockEvent,
      incomingPayload: { 
        task, 
        parameters: { exhibit_data: { entity_id:entity1.entity_id } } 
      } as IncomingPayload
    });
  },
  missingEntityId: async(_handler:any, mockEvent:any, task:string, message:string) => {
    await invokeAndAssert({
      expectedResponse: {
        statusCode: 400,
        outgoingBody: {
          message,
          payload: { invalid: true }
        }
      },
      _handler, mockEvent,
      incomingPayload: { 
        task, 
        parameters: { exhibit_data: { affiliates:{ type: AffiliateTypes.EMPLOYER } as Affiliate } } 
      } as IncomingPayload
    });
  },
  missingFullname: async(_handler:any, mockEvent:any, task:string, message:string) => {
    await invokeAndAssert({
      expectedResponse: {
        statusCode: 400,
        outgoingBody: {
          message,
          payload: { invalid: true }
        }
      },
      _handler, mockEvent,
      incomingPayload: { 
        task, 
        parameters: { exhibit_data: { 
          affiliates:{ type: AffiliateTypes.EMPLOYER } as Affiliate,
          entity_id: entity1.entity_id,          
        } as ExhibitData} 
      } as IncomingPayload
    });
  },
  entityLookupFailure: async(_handler:any, mockEvent:any, task:string) => {
    mockCalls.reset();
    await invokeAndAssert({
      expectedResponse: {
        statusCode: 500,
        outgoingBody: {
          message: `Internal server error: ${ERROR_MESSAGE}`,
          payload: { error: true }
        }
      },
      _handler, mockEvent,
      incomingPayload: { 
        task, 
        parameters: {
          exhibit_data: {
            email: 'yosemitesam@warnerbros.com',
            entity_id: BAD_ENTITY_ID1,
            fullname: 'Yosemite Sam',
            affiliates
          } as ExhibitData
        } 
      } as IncomingPayload
    } as TestParms);
    expect(mockCalls.called(`entity.read.${BAD_ENTITY_ID1}`)).toEqual(1);
    expect(mockCalls.called(`user.read`)).toEqual(0);
    expect(mockCalls.called('email.send')).toEqual(0);
  },
  userLookupFailure: async(_handler:any, mockEvent:any, task:string) => {
    mockCalls.reset();
    await invokeAndAssert({
      expectedResponse: {
        statusCode: 500,
        outgoingBody: {
          message: `Internal server error: ${ERROR_MESSAGE}`,
          payload: { error: true }
        }
      },
      _handler, mockEvent,
      incomingPayload: { 
        task, 
        parameters: {
          exhibit_data: {
            email: 'yosemitesam@warnerbros.com',
            entity_id: BAD_ENTITY_ID2,
            fullname: 'Yosemite Sam',
            affiliates
          } as ExhibitData
        } 
      } as IncomingPayload
    } as TestParms);
    expect(mockCalls.called(`entity.read.${BAD_ENTITY_ID2}`)).toEqual(1);
    expect(mockCalls.called(`user.read`)).toEqual(1);
    expect(mockCalls.called('email.send')).toEqual(0);
  },
  sendEmailFailure: async(_handler:any, mockEvent:any, task:string, message:string) => {
    let _affiliates = deepClone(affiliates);
    mockCalls.reset();
    let parms = {
      expectedResponse: {
        statusCode: 500,
        outgoingBody: {
          message,
          payload: { error: true, emailFailures: [ BAD_EXHIBIT_RECIPIENT_EMAIL ] }
        }
      },
      _handler, mockEvent,
      incomingPayload: { 
        task, 
        parameters: {
          exhibit_data: {
            email: 'yosemitesam@warnerbros.com',
            entity_id: BAD_ENTITY_ID3,
            fullname: 'Yosemite Sam',
            affiliates: _affiliates
          } as ExhibitData
        } 
      } as IncomingPayload
    } as TestParms;

    await invokeAndAssert(parms);
    expect(mockCalls.called(`entity.read.${BAD_ENTITY_ID3}`)).toEqual(1);
    expect(mockCalls.called(`user.read`)).toEqual(1);
    // badUser should throw an error when email is sent, but this should not halt email sending
    // and both bugs bunny and daffyduck should have attempts to email registered.
    expect(mockCalls.called(`email.send.${FormTypes.FULL}.${daffyduck.email}`)).toEqual(1);
    expect(mockCalls.called(`email.send.${FormTypes.FULL}.${bugsbunny.email}`)).toEqual(1);
    expect(mockCalls.called(`email.send.${FormTypes.FULL}.${badUser.email}`)).toEqual(1);
    expect(mockCalls.called(`email.send.${FormTypes.FULL}.${porkypig.email}`)).toEqual(0);
    expect(mockCalls.called(`email.send.${FormTypes.SINGLE}.${foghorLeghorn.email}`)).toEqual(1);
    expect(mockCalls.called(`email.send.${FormTypes.SINGLE}.${wileECoyote.email}`)).toEqual(1);

    mockCalls.reset();
    _affiliates = deepClone(affiliates);
    _affiliates[0].email = BAD_EXHIBIT_RECIPIENT_EMAIL;
    parms.incomingPayload.parameters['exhibit_data'].entity_id = entity1.entity_id;
    parms.incomingPayload.parameters['exhibit_data'].affiliates = _affiliates;
    const badAffiliate = _affiliates[0];
    const goodAffiliate = _affiliates[1];
    await invokeAndAssert(parms);
    expect(mockCalls.called(`email.send.${FormTypes.FULL}.${daffyduck.email}`)).toEqual(1);
    expect(mockCalls.called(`email.send.${FormTypes.FULL}.${bugsbunny.email}`)).toEqual(1);
    expect(mockCalls.called(`email.send.${FormTypes.FULL}.${porkypig.email}`)).toEqual(1);
    // Attempt to send email to one of the affiliates will fail, but should not stop email attempt on the other.
    expect(mockCalls.called(`email.send.${FormTypes.SINGLE}.${badAffiliate.email}`)).toEqual(1);
    expect(mockCalls.called(`email.send.${FormTypes.SINGLE}.${goodAffiliate.email}`)).toEqual(1);
  },
  sendEmailOk: async(_handler:any, mockEvent:any, task:string) => {
    mockCalls.reset();
    const _affiliates = deepClone(affiliates);
    let parms = {
      expectedResponse: {
        statusCode: 200,
        outgoingBody: {
          message: `Ok`,
          payload: { ok: true }
        }
      },
      _handler, mockEvent,
      incomingPayload: { 
        task, 
        parameters: {
          exhibit_data: {
            email: 'yosemitesam@warnerbros.com',
            entity_id: entity1.entity_id,
            fullname: 'Yosemite Sam',
            affiliates: _affiliates
          } as ExhibitData
        } 
      } as IncomingPayload
    } as TestParms;

    mockCalls.reset();
    await invokeAndAssert(parms);
    expect(mockCalls.called(`entity.read.${entity1.entity_id}`)).toEqual(1);
    expect(mockCalls.called(`user.read`)).toEqual(1);
    expect(mockCalls.called(`email.send.${FormTypes.FULL}.${daffyduck.email}`)).toEqual(1);
    expect(mockCalls.called(`email.send.${FormTypes.FULL}.${bugsbunny.email}`)).toEqual(1);
    expect(mockCalls.called(`email.send.${FormTypes.FULL}.${porkypig.email}`)).toEqual(1);
    expect(mockCalls.called(`email.send.${FormTypes.SINGLE}.${foghorLeghorn.email}`)).toEqual(1);
    expect(mockCalls.called(`email.send.${FormTypes.SINGLE}.${wileECoyote.email}`)).toEqual(1);
  }
}