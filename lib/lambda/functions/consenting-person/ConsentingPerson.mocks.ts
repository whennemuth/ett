import { S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import 'aws-sdk-client-mock-jest';
import { IncomingPayload, OutgoingBody } from "../../../role/AbstractRole";
import { DAOConsenter, DAOEntity, DAOInvitation, DAOUser, FactoryParms } from "../../_lib/dao/dao";
import { Affiliate, AffiliateTypes, Config, Consenter, Entity, ExhibitFormConstraints, ExhibitForm as ExhibitFormData, FormType, FormTypes, Roles, User, YN } from "../../_lib/dao/entity";
import { DisclosureFormData } from "../../_lib/pdf/DisclosureForm";
import { IPdfForm } from "../../_lib/pdf/PdfForm";
import { deepClone } from "../../Utils";
import { MockCalls, TestParms, invokeAndAssert } from "../../UtilsTest";
import { BucketDisclosureFormParms } from "./BucketItemDisclosureForm";
import { BucketItemMetadata, BucketItemMetadataParms } from "./BucketItemMetadata";
import { ExhibitFormParms } from "../../_lib/pdf/ExhibitForm";

/**
 * Keeps track of how many times any method of any mock has been called.
 */
const mockCalls = new MockCalls();

/**
 * Designate what mocked consenter lookups are expected to return in terms of consent.
 */
enum ConsentState { OK, NONE, RESCINDED, RESTORED, INACTIVE }

/**
 * Define a mock for the es6 ExhibitEmail class
 * @returns 
 */
export function ExhibitEmailMock() {
  return {
    ExhibitEmail: jest.fn().mockImplementation((parms:ExhibitFormParms) => {
      return {
        send: async (to:string[], cc?:string[]):Promise<boolean> => {
          const { formType } = parms.data;
          mockCalls.update(`email.send`);
          mockCalls.update(`email.send.${formType}.${to[0]}`);
          return (to.includes(BAD_EXHIBIT_RECIPIENT_EMAIL) || cc?.includes(BAD_EXHIBIT_RECIPIENT_EMAIL)) ? false : true;
        },
        getAttachment: ():IPdfForm => {
          return {} as IPdfForm;
        }
      }
    })
  }
}

/**
 * 
 * @returns Define a mock for the es6 ExhibitBucket class
 */
export function ExhibitFormBucketItemsMock() {
  return {
    BucketExhibitForm: jest.fn().mockImplementation((metadata:BucketItemMetadataParms|string) => {
      return {
        add: async (consenter:Consenter, _correction:boolean=false):Promise<string> => {
          const { affiliateEmail } = metadata as BucketItemMetadataParms;
          mockCalls.update(`bucket.add.exhibit.${affiliateEmail}`);
          return BucketItemMetadata.toBucketFileKey(metadata as BucketItemMetadataParms);
        }
      }
    })
  }
}

/**
 * 
 * @returns Define a mock for the es6 ExhibitBucket class
 */
export function DisclosureFormBucketItemsMock() {
  return {
    BucketDisclosureForm: jest.fn().mockImplementation((parms:BucketDisclosureFormParms) => {
      const { metadata } = parms;
      const { affiliateEmail } = metadata as BucketItemMetadataParms;
      return {
        add: async (consenter:Consenter, _correction:boolean=false):Promise<string> => {
          mockCalls.update(`bucket.add.disclosure.${affiliateEmail}`);
          return BucketItemMetadata.toBucketFileKey(metadata as BucketItemMetadataParms);
        }        
      }
    })
  }
}

export function DisclosureFormMock() {
  return {
    DisclosureForm: jest.fn().mockImplementation((data:DisclosureFormData) => {
      return {
        getBytes: async ():Promise<Uint8Array> => {
          return new Uint8Array();
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
export const sylvesterTheCat = { email: 'sylvester@looneyTunes.com', firstname: 'Sylvester', middlename: 'the', lastname: 'Cat', title: 'Mouse Catcher', active: YN.Yes } as Consenter;
export const foghorLeghorn = { email: 'foghorn@looneyTunes.com', affiliateType: AffiliateTypes.ACADEMIC, fullname: 'Foghorn Leghorn', org: 'Looney Tunes', phone_number: '781-444-6666', title:'Head Rooster' } as Affiliate;
export const wileECoyote = { email: 'coyote@acme.com', affiliateType: AffiliateTypes.EMPLOYER, fullname: 'Wile E. Coyote', org: 'ACME', phone_number: '617-333-5555', title:'Acme. tester' } as Affiliate;
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
          case "consenter":
            mockCalls.update('consenter.read');
            return { 
              read: async ():Promise<Consenter|Consenter[]> => {
                let consenter = {} as Consenter;
                let consented;
                const day = 1000 * 60 * 60 * 24;
                const retracted = new Date();
                const consentState = parseInt(email.split('-')[0]);            
                switch(consentState) {
                  case ConsentState.OK:
                    consenter = Object.assign(consenter, sylvesterTheCat);
                    consenter.consented_timestamp = [ new Date().toISOString() ];
                    break;
                  case ConsentState.NONE:
                    consenter = Object.assign(consenter, sylvesterTheCat);
                    consenter.active = YN.No;
                    break;
                  case ConsentState.RESCINDED:
                    consented = new Date(retracted.getTime() - day);
                    consenter = Object.assign(consenter, sylvesterTheCat);
                    consenter.consented_timestamp = [ consented.toISOString() ];
                    consenter.rescinded_timestamp = [ retracted.toISOString() ];
                    break;
                  case ConsentState.RESTORED:
                    consented = new Date(retracted.getTime() + day);
                    consenter = Object.assign(consenter, sylvesterTheCat);
                    consenter.consented_timestamp = [ consented.toISOString() ];
                    consenter.rescinded_timestamp = [ retracted.toISOString() ];
                    break;
                  case ConsentState.INACTIVE:
                    consenter = Object.assign(consenter, sylvesterTheCat);
                    consenter.consented_timestamp = [ new Date().toISOString() ];
                    consenter.active = YN.No;
                    break;
                  default:
                    consenter = Object.assign(consenter, sylvesterTheCat);
                    break;                  
                }
                consenter.email = email;
                return consenter;
              },
              update: async (oldEntity?:any, merge?:boolean):Promise<any> => {
                mockCalls.update('consenter.update');
              }
            } as DAOConsenter;
          case "config":
            mockCalls.update('config.read');
            return { read: async ():Promise<(Config|null)|Config[]> => {
              return {} as Config;
            }}
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
        parameters: { email: sylvesterTheCat.email, exhibit_data: { entity_id:entity1.entity_id } } 
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
        parameters: { exhibit_data: { affiliates:{ affiliateType: AffiliateTypes.EMPLOYER } as Affiliate } } 
      } as IncomingPayload
    });
  },
  missingEmail: async(_handler:any, mockEvent:any, task:string, message:string) => {
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
          affiliates: [{ affiliateType: AffiliateTypes.EMPLOYER }] as Affiliate[],
          entity_id: entity1.entity_id,          
        } as ExhibitFormData} 
      } as IncomingPayload
    });
  },
  missingConsent: async(_handler:any, mockEvent:any, task:string, message:string) => {
    mockCalls.reset();
    let _affiliates = deepClone(affiliates);
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
        parameters: {
          email: `${ConsentState.NONE}-${sylvesterTheCat.email}`,
          exhibit_data: {
            formType: FormTypes.FULL,
            constraint: ExhibitFormConstraints.BOTH,
            email: 'yosemitesam@warnerbros.com',
            entity_id: entity1.entity_id,
            fullname: 'Yosemite Sam',
            affiliates: _affiliates
          } as ExhibitFormData
        } 
      } as IncomingPayload
    } as TestParms);
    expect(mockCalls.called(`consenter.read`)).toEqual(1);
    expect(mockCalls.called(`entity.read`)).toEqual(0);
    expect(mockCalls.called(`user.read`)).toEqual(0);
    expect(mockCalls.called('email.send')).toEqual(0);
  },
  rescindedConsent: async(_handler:any, mockEvent:any, task:string, message:string) => {
    mockCalls.reset();
    let _affiliates = deepClone(affiliates);
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
        parameters: {
          email: `${ConsentState.RESCINDED}-${sylvesterTheCat.email}`,
          exhibit_data: {
            formType: FormTypes.FULL,
            constraint: ExhibitFormConstraints.BOTH,
            email: 'yosemitesam@warnerbros.com',
            entity_id: entity1.entity_id,
            fullname: 'Yosemite Sam',
            affiliates: _affiliates
          } as ExhibitFormData
      } 
      } as IncomingPayload
    } as TestParms);
    expect(mockCalls.called(`consenter.read`)).toEqual(1);
    expect(mockCalls.called(`entity.read`)).toEqual(0);
    expect(mockCalls.called(`user.read`)).toEqual(0);
    expect(mockCalls.called('email.send')).toEqual(0);
  },
  consenterInactive: async(_handler:any, mockEvent:any, task:string, message:string) => {
    mockCalls.reset();
    let _affiliates = deepClone(affiliates);
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
        parameters: {
          email: `${ConsentState.INACTIVE}-${sylvesterTheCat.email}`,
          exhibit_data: {
            formType: FormTypes.FULL,
            constraint: ExhibitFormConstraints.BOTH,
            email: 'yosemitesam@warnerbros.com',
            entity_id: entity1.entity_id,
            fullname: 'Yosemite Sam',
            affiliates: _affiliates
          } as ExhibitFormData
      } 
      } as IncomingPayload
    } as TestParms);
    expect(mockCalls.called(`consenter.read`)).toEqual(1);
    expect(mockCalls.called(`entity.read`)).toEqual(0);
    expect(mockCalls.called(`user.read`)).toEqual(0);
    expect(mockCalls.called('email.send')).toEqual(0);
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
          email: `${ConsentState.OK}-${sylvesterTheCat.email}`,
          exhibit_data: {
            formType: FormTypes.FULL,
            constraint: ExhibitFormConstraints.BOTH,
            email: 'yosemitesam@warnerbros.com',
            entity_id: BAD_ENTITY_ID1,
            fullname: 'Yosemite Sam',
            affiliates
          } as ExhibitFormData
        } 
      } as IncomingPayload
    } as TestParms);
    expect(mockCalls.called(`consenter.read`)).toEqual(1);
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
          email: `${ConsentState.OK}-${sylvesterTheCat.email}`,
          exhibit_data: {
            formType: FormTypes.FULL,
            constraint: ExhibitFormConstraints.BOTH,
            email: 'yosemitesam@warnerbros.com',
            entity_id: BAD_ENTITY_ID2,
            fullname: 'Yosemite Sam',
            affiliates
          } as ExhibitFormData
        } 
      } as IncomingPayload
    } as TestParms);
    expect(mockCalls.called(`consenter.read`)).toEqual(1);
    expect(mockCalls.called(`entity.read.${BAD_ENTITY_ID2}`)).toEqual(1);
    expect(mockCalls.called(`user.read`)).toEqual(1);
    expect(mockCalls.called('email.send')).toEqual(0);
  },
  sendEmailFailure: async (_handler:any, mockEvent:any, task:string, message:string) => {
    const s3ClientMock = mockClient(S3Client);
    let _affiliates = deepClone(affiliates);
    let parms = {
      expectedResponse: {
        statusCode: 500,
        outgoingBody: {
          message: `${message.replace('INSERT_EMAIL', `${ConsentState.OK}-${sylvesterTheCat.email.toLowerCase()}`)}`,
          payload: { 
            error: true,
            failedEmails: [ daffyduck.email, BAD_EXHIBIT_RECIPIENT_EMAIL, bugsbunny.email ]
          }
        }
      },
      _handler, mockEvent,
      incomingPayload: { 
        task, 
        parameters: {
          email: `${ConsentState.OK}-${sylvesterTheCat.email}`,
          exhibit_data: {
            formType: FormTypes.FULL,
            constraint: ExhibitFormConstraints.BOTH,
            email: 'yosemitesam@warnerbros.com',
            // entity_id: BAD_ENTITY_ID3,
            entity_id: entity1.entity_id,
            fullname: 'Yosemite Sam',
            affiliates: _affiliates
          } as ExhibitFormData
        } 
      } as IncomingPayload
    } as TestParms;

    mockCalls.reset();
    s3ClientMock.reset();
    // parms.incomingPayload.parameters['exhibit_data']['sent_timestamp'] = 'never';
    const temp = porkypig.email;
    porkypig.email = badUser.email;
    await invokeAndAssert(parms);
    porkypig.email = temp;
    expect(mockCalls.called(`consenter.read`)).toEqual(1);
    expect(mockCalls.called(`entity.read.${entity1.entity_id}`)).toEqual(1);
    expect(mockCalls.called(`user.read`)).toEqual(1);
    // badUser should throw an error when email is sent, but this should not halt email execution
    // and further calls to send emails should proceed.
    expect(mockCalls.called(`email.send`)).toEqual(2);
    expect(mockCalls.called(`email.send.${FormTypes.FULL}.${daffyduck.email}`)).toEqual(1);
    expect(mockCalls.called(`email.send.${FormTypes.FULL}.${ConsentState.OK}-${sylvesterTheCat.email.toLowerCase()}`)).toEqual(1);
    expect(mockCalls.called(`email.send.${FormTypes.FULL}.${badUser.email}`)).toEqual(0);
    expect(mockCalls.called(`email.send.${FormTypes.FULL}.${porkypig.email}`)).toEqual(0);
    expect(mockCalls.called(`email.send.${FormTypes.FULL}.${bugsbunny.email}`)).toEqual(0);
    expect(s3ClientMock.calls().length).toEqual(2);

    // _affiliates = deepClone(affiliates);
    // _affiliates[0].email = BAD_EXHIBIT_RECIPIENT_EMAIL;
    // parms.incomingPayload.parameters['exhibit_data'].entity_id = entity1.entity_id;
    // parms.incomingPayload.parameters['exhibit_data'].affiliates = _affiliates;
    // const badAffiliate = _affiliates[0];
    // const goodAffiliate = _affiliates[1];
    // mockCalls.reset();
    // await invokeAndAssert(parms);
    // expect(mockCalls.called(`email.send.${FormTypes.FULL}.${daffyduck.email}`)).toEqual(1);
    // expect(mockCalls.called(`email.send.${FormTypes.FULL}.${bugsbunny.email}`)).toEqual(1);
    // expect(mockCalls.called(`email.send.${FormTypes.FULL}.${porkypig.email}`)).toEqual(1);
    // // Attempt to send email to one of the affiliates will fail, but should not stop email attempt on the other.
    // expect(mockCalls.called(`email.send.${FormTypes.SINGLE}.${badAffiliate.email}`)).toEqual(1);
    // expect(mockCalls.called(`email.send.${FormTypes.SINGLE}.${goodAffiliate.email}`)).toEqual(1);
  },
  sendEmailOk: async(_handler:any, mockEvent:any, task:string) => {
    const s3ClientMock = mockClient(S3Client);
    mockCalls.reset();
    const getParms = (email:string) => {
      return {
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
            email,
            exhibit_data: {
              formType: FormTypes.FULL,
              constraint: ExhibitFormConstraints.BOTH,
              email: 'yosemitesam@warnerbros.com',
              entity_id: entity1.entity_id,
              fullname: 'Yosemite Sam',
              affiliates
            } as ExhibitFormData
          } 
        } as IncomingPayload
      } as TestParms;
    }


    const doTest = async (parms:TestParms) => {
      mockCalls.reset();
      s3ClientMock.reset();
      await invokeAndAssert(parms, true);
      expect(mockCalls.called(`consenter.read`)).toEqual(3);
      expect(mockCalls.called(`entity.read.${entity1.entity_id}`)).toEqual(1);
      expect(mockCalls.called(`user.read`)).toEqual(1);
      expect(mockCalls.called(`email.send`)).toEqual(2);
      expect(mockCalls.called(`email.send.${FormTypes.FULL}.${daffyduck.email}`)).toEqual(1);
      expect(mockCalls.called(`email.send.${FormTypes.FULL}.${parms.incomingPayload.parameters.email.toLowerCase()}`)).toEqual(1);
      expect(mockCalls.called(`bucket.add.exhibit.${foghorLeghorn.email}`)).toEqual(1);
      expect(mockCalls.called(`bucket.add.exhibit.${wileECoyote.email}`)).toEqual(1);
      expect(mockCalls.called(`consenter.update`)).toEqual(1);
      expect(s3ClientMock.calls().length).toEqual(2);
    }

    // Test for someone who has consented
    await doTest(getParms(`${ConsentState.OK}-${sylvesterTheCat.email}`));

    // Test for someone who rescinded their consent but later restored it.
    await doTest(getParms(`${ConsentState.RESTORED}-${sylvesterTheCat.email}`));
  }
}