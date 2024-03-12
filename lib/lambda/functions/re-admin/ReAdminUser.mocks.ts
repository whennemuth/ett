// TODO: Move this module out into a more generic location

import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse, OutgoingBody } from "../../../role/AbstractRole";
import { FactoryParms } from "../../_lib/dao/dao";
import { ENTITY_WAITING_ROOM } from "../../_lib/dao/dao-entity";
import { Entity, EntityFields, Invitation, Role, Roles, User, YN } from "../../_lib/dao/entity";

/**
 * Define a partial mock for Utils.ts module
 * @param originalModule 
 * @returns 
 */
export function UtilsMock(originalModule: any) {
  return {
    __esModule: true,
    ...originalModule,
    lookupSingleUser: async (email:string, entity_id:string):Promise<User|null> => { 
      if(email === 'exists@gmail.com') {
        return {
          email, entity_id, role:Roles.RE_AUTH_IND
        } as User;
      }
      return null;
    },
    lookupUser: async (email:string): Promise<User[]> => {
      const userInstances = [] as User[];
      switch(email) {
        case 'reAdmin@foreignEntity.net':
          userInstances.push({
            email, role:Roles.RE_ADMIN, sub: 're_admin_foreign_entity_sub', entity_id: 'id_for_different_entity', active: YN.Yes
          })
          break;
        case 'reAdmin@sameEntity.net':
          userInstances.push({
            email, role:Roles.RE_ADMIN, sub: 're_admin_same_entity_sub', entity_id: 'id_for_invitee_entity', active: YN.Yes
          })
        default:
          break;
      }
      return userInstances;
    },
    lookupPendingInvitations: async (entity_id:string):Promise<Invitation[]> => {
      const pending = [] as Invitation[];
      switch(entity_id) {
        case 'id_for_entity_with_pending_invitation_for_re_admin':
          pending.push( { code: 'abc123', entity_id, email: 'alreadyInvitedReAdmin@gmail.com', role:Roles.RE_ADMIN } as Invitation );
          break;
        case 'id_for_entity_with_pending_invitation_for_auth_ind':
          pending.push( { code: 'abc123', entity_id, email: 'alreadyInvitedAuthInd@gmail.com', role:Roles.RE_AUTH_IND } as Invitation );
          break;
        case 'id_for_entity_with_retracted_invitation_for_re_admin':
          pending.push( { 
            code: 'abc123', entity_id, email: 'invitedButRetracted@gmail.com', 
            role: Roles.RE_ADMIN, retracted_timestamp: new Date().toISOString() 
          } as Invitation );
          break;
        case 'id_for_entity_with_peer_invitation_for_auth_ind':
          pending.push( { 
            code: 'abc123', entity_id, email: 'invitedPeer@gmail.com', 
            role:Roles.RE_AUTH_IND, retracted_timestamp: new Date().toISOString() 
          } as Invitation );
          break;
      }
      return pending;
    },
    lookupSingleActiveEntity: async (entity_id:string):Promise<Entity|null> => {
      const dte = new Date().toISOString();
      let entity = {
        entity_id, entity_name: `Name for ${entity_id}`, description: `Description for ${entity_id}`,
        active: YN.Yes, create_timestamp: dte, update_timestamp: dte
      } as Entity;
      switch(entity_id) {
        case 'id_for_active_entity':
          break;
        case 'id_for_deactivated_entity':
          return null;
        case 'id_for_no_such_entity':
          return null;
      } 
      return entity;    
    }
  }
}

/**
 * Define a partial mock for the cognito Lookup.ts module
 * @param originalModule
 * @returns 
 */
export function CognitoLookupMock(originalModule: any) {
  return {
    __esModule: true,
    ...originalModule,
    lookupEmail: async (UserPoolId:string, Username:string, region:string):Promise<string|undefined> => {
      switch(Username) {
        case 're_admin_foreign_entity_sub':
          return 'reAdmin@foreignEntity.net';
        case 're_admin_same_entity_sub':
          return 'reAdmin@sameEntity.net';
        default:
          return undefined;
      }
    }
  }
}

/**
 * Define a mock for the es6 UserInvitation class
 * @returns 
 */
export function InvitationMock() {
  return {
    UserInvitation: jest.fn().mockImplementation((invitation:Invitation, link:string, entity_name?:string) => {
      return {
        send: async () => {
          return invitation.entity_id != 'explode';
        },
        code: 'abc123',
        link
      };
    })
  };
}

/**
 * Define a mock for the es6 SignupLink class
 * @returns 
 */
export function SignupLinkMock() {
  return {
    SignupLink: jest.fn().mockImplementation((userPoolName?:string) => {
      return {
        getCognitoLinkForRole: async (role:Role): Promise<string|undefined> => {
          return 'sysadmin-signup-link';
        },
        getRegistrationLink: async (entity_id?:string):Promise<string|undefined> => {
          return 'non-sysadmin-signup-link'
        }
      }
    })
  }
}

/**
 * Define a mock for the es6 DAOFactory class
 */
const inactiveUser = { email: 'inactiveUser@gmail.com', entity_id: 'warnerbros', role: Roles.RE_ADMIN, active: YN.No } as User;
const daffyduck1 = { email: 'daffyduck@warnerbros.com', entity_id: 'warnerbros', role: Roles.RE_ADMIN, active: YN.Yes } as User;
const porkypig = { email: 'porkypig@warnerbros.com', entity_id: 'warnerbros', role: Roles.RE_AUTH_IND, active: YN.Yes } as User;
const bugsbunny = { email: 'bugs@warnerbros.com', entity_id: 'warnerbros', role: Roles.RE_AUTH_IND, active: YN.Yes } as User;
const daffyduck2 = { email: 'daffyduck@warnerbros.com', entity_id: 'cartoonville', role: Roles.RE_ADMIN, active: YN.Yes } as User;
const yosemitesam = { email: 'yosemitesam@cartoonville.com', entity_id: 'cartoonville', role: Roles.RE_AUTH_IND, active: YN.Yes } as User;
const foghornLeghorn = { email: 'fl@cartoonville.com', entity_id: 'cartoonville', role: Roles.RE_AUTH_IND, active: YN.Yes } as User;
export type MockingScenario = {
  UserLookup: 'normal' | 'waitingroom' | 'multi-match'
}
let currentScenario:MockingScenario
export function DaoMock(originalModule: any) {
  return {
    __esModule: true,
    ...originalModule,
    DAOFactory: {
      getInstance: jest.fn().mockImplementation((parms:FactoryParms) => {
        let { email, entity_id } = parms.Payload;
        if(parms.DAOType == 'user') {
          return {
            read: async ():Promise<User|User[]> => {
              switch(email) {
                case 'inactiveUser@gmail.com':
                  return [ inactiveUser ] as User[]
                case 'daffyduck@warnerbros.com':
                  switch(currentScenario.UserLookup) {
                    case "normal":
                      return [ daffyduck1 ] as User[];
                    case "waitingroom":
                      var dduck1 = Object.assign({}, daffyduck1);
                      dduck1.entity_id = ENTITY_WAITING_ROOM;
                      return [ dduck1, daffyduck2 ];
                    case "multi-match":
                      var dduck2 = Object.assign({}, daffyduck2);
                      dduck2.entity_id = 'cartoonville';
                      return [ dduck2, daffyduck1 ];
                  }
              }
              switch(entity_id) {
                case 'warnerbros':
                  return [ daffyduck1, porkypig, bugsbunny ];
                case 'cartoonville':
                  return [ daffyduck2, yosemitesam, foghornLeghorn ]
              }
              return [] as User[];
            }
          }
        }

        if(parms.DAOType == 'entity') {
          return {
            read: async ():Promise<Entity|null> => {
              switch(entity_id) {
                case 'warnerbros':
                  return {
                    entity_id, entity_name: 'Warner Bros.', active: YN.Yes
                  } as Entity
                case 'cartoonville':
                  return {
                    entity_id, entity_name: 'Cartoon Villiage', active: YN.Yes
                  } as Entity
              }
              return null;
            }
          }
        }

        return null;
      })
    }
  }
}

type Expected = { statusCode:number, outgoingBody:OutgoingBody };
type TestParms = { 
  expectedResponse:Expected, 
  incomingPayload:IncomingPayload, 
  mockEvent:any, 
  _handler:any,
  inviterCognitoSub?:string
}
/**
 * Invoke the lambda function and check all supplied assertions about the response:
 *   1) Modify the mocked event object for the lambda function so that it includes a mock payload from supposed api request
 *   2) Invoke the lambda
 *   3) Assert the returned status code, message and payload
 * @returns 
 */
const invokeAndAssert = async (testParms:TestParms) => {
  // Destructure the testParms
  const { _handler, expectedResponse, mockEvent, incomingPayload, inviterCognitoSub } = testParms;
  const payloadStr:string = JSON.stringify(incomingPayload);
  
  // Inject the supplied payload and attributes into the mock event object
  mockEvent.headers[AbstractRoleApi.ETTPayloadHeader as keyof typeof mockEvent.headers] = payloadStr;
  if(inviterCognitoSub) {
    mockEvent.requestContext.authorizer.claims.username = inviterCognitoSub;
  } 
  else {
    // Reset the username attribute back to what it originally was.
    const sub = mockEvent.requestContext.authorizer.claims.sub
    mockEvent.requestContext.authorizer.claims.username = sub;
  }

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


/**
 * Define the lambda function parameter validation tests.
 */
export const ParameterValidationTests = {
  pingTest: async (_handler:any, eventMock:any) => {
    await invokeAndAssert({
      expectedResponse: { 
        statusCode: 200, 
        outgoingBody:{ message: 'Ping!', payload: { ok:true, ping:true }} as OutgoingBody 
      },
      _handler, mockEvent: eventMock,
      incomingPayload: { task: 'ping', parameters: { ping: true } } as IncomingPayload
    });  
  },
  missingPayload: async (_handler:any, eventMock:any) => {
    await invokeAndAssert({
      expectedResponse: {
        statusCode: 400, 
        outgoingBody: { 
          message: `Missing parameters parameter for invite_user`, 
          payload: { invalid: true  }
        }
      }, 
      _handler, mockEvent: eventMock,
      incomingPayload: { task: 'invite_user' } as IncomingPayload
    });
  },
  bogusTask: async (_handler:any, eventMock:any) => {
    await invokeAndAssert({
      expectedResponse: {
        statusCode: 400,
        outgoingBody: { 
          message: 'Invalid/Missing task parameter: bogus',
          payload: { invalid: true  }
        }
      }, 
      _handler, mockEvent: eventMock,
      incomingPayload: { task: 'bogus' } as IncomingPayload      
    })
  }
}

/**
 * Define the lamba function tests for activity involved with inviting users
 */
export const UserInvitationTests = {
  reAdminInvitesWrongRole: async (_handler:any, eventMock:any, taskName:string) => {
    await invokeAndAssert({
      _handler, mockEvent:eventMock,
      incomingPayload: {
        task: taskName,
        parameters: { 
          email: "readminInvitee@gmail.com", 
          entity_id: "id_for_active_entity", 
          role: Roles.RE_ADMIN 
        }
      },
      expectedResponse: {
        statusCode: 400,
        outgoingBody: { 
          message: `An ${Roles.RE_ADMIN} can only invite a ${Roles.RE_AUTH_IND}`,
          payload: { invalid: true }
        }
      }, 
    });
  },
  alreadyAccepted: async (_handler:any, eventMock:any, taskName:string) => {
    await invokeAndAssert({
      _handler, mockEvent:eventMock,
      incomingPayload: {
        task: taskName,
        parameters: {
          email: "exists@gmail.com", 
          entity_id: "id_for_active_entity", 
          role: Roles.RE_AUTH_IND
        }
      },
      expectedResponse: {
        statusCode: 400,
        outgoingBody: { 
          message: `Invitee exists@gmail.com has already accepted invitation for entity id_for_active_entity`,
          payload: { invalid: true  }
        }
      },
    });
  },
  outstandingInvitationReAdmin: async (_handler:any, eventMock:any, taskName:string) => {
    await invokeAndAssert({
      _handler, mockEvent:eventMock,
      incomingPayload: {
        task: taskName,
        parameters: { 
          email: "alreadyInvitedReAdmin@gmail.com", 
          entity_id: "id_for_entity_with_pending_invitation_for_re_admin", 
          role: Roles.RE_ADMIN
        }
      },
      expectedResponse: {
        statusCode: 400,
        outgoingBody: { 
          message: `One or more individuals already have outstanding invitations for role: ${Roles.RE_ADMIN} in entity: id_for_entity_with_pending_invitation_for_re_admin`,
          payload: { invalid: true }
        }
      }
    });
  },
  outstandingInvitationAuthInd: async (_handler:any, eventMock:any, taskName:string) => {
    await invokeAndAssert({
      _handler, mockEvent:eventMock,
      incomingPayload: {
        task: taskName,
        parameters: {
          email: "alreadyInvitedAuthInd@gmail.com", 
          entity_id: 'id_for_entity_with_pending_invitation_for_auth_ind', 
          role: Roles.RE_AUTH_IND
        }
      },
      expectedResponse: {
        statusCode: 200,
        outgoingBody: { 
          message: `Invitation successfully sent: abc123`,
          payload: { ok: true, invitation_code: 'abc123', invitation_link: 'non-sysadmin-signup-link'  }
        }
      }
    });
  },
  deactivatedEntity: async (_handler:any, eventMock:any, taskName:string) => {
    await invokeAndAssert({
      _handler, mockEvent:eventMock,
      incomingPayload: {
        task: taskName,
        parameters: {
          email: "inviteeToDeactivatedEntity@gmail.com", 
          entity_id: "id_for_deactivated_entity", 
          role: Roles.RE_AUTH_IND
        }
      },
      expectedResponse: {
        statusCode: 400,
        outgoingBody: { 
          message: `Entity id_for_deactivated_entity lookup failed`,
          payload: { invalid: true  }
        }
      }
    });
  },
  authIndInviteToNoSuchEntity: async (_handler:any, eventMock:any, taskName:string) => {
    await invokeAndAssert({
      _handler, mockEvent:eventMock,
      incomingPayload: {
        task: taskName,
        parameters: {
          email: "inviteeToBogusEntity@gmail.com", 
          entity_id: "id_for_no_such_entity", 
          role: Roles.RE_AUTH_IND
        }
      },
      expectedResponse: {
        statusCode: 400,
        outgoingBody: { 
          message: `Entity id_for_no_such_entity lookup failed`,
          payload: { invalid: true  }
        }
      }
    });
  },
  authIndInviteFromForeignEntity: async (_handler:any, eventMock:any, taskName:string) => {
    await invokeAndAssert({
      _handler, mockEvent:eventMock,
      incomingPayload: {
        task: taskName,
        parameters: {
          email: 'inviteeToForeignEntity@gmail.com',
          entity_id: 'id_for_invitee_entity',
          role: Roles.RE_AUTH_IND
        }
      },
      expectedResponse: {
        statusCode: 400,
        outgoingBody: { 
          message: 'The RE_ADMIN cannot invite anyone to entity: id_for_invitee_entity if they are not a member themselves.',
          payload: { invalid: true  }
        }
      },
      inviterCognitoSub: 're_admin_foreign_entity_sub'
    });
  },
  authIndInviteFromSameEntity:  async (_handler:any, eventMock:any, taskName:string) => {
    await invokeAndAssert({
      _handler, mockEvent:eventMock,
      incomingPayload: {
        task: taskName,
        parameters: {
          email: 'inviteeToSameEntity@gmail.com',
          entity_id: 'id_for_invitee_entity',
          role: Roles.RE_AUTH_IND
        }
      },
      expectedResponse: {
        statusCode: 200,
        outgoingBody: { 
          message: `Invitation successfully sent: abc123`,
          payload: { ok: true, invitation_code: 'abc123', invitation_link: 'non-sysadmin-signup-link' }
        }
      },
      inviterCognitoSub: 're_admin_same_entity_sub'
    });
  },
  sendError: async (_handler:any, eventMock:any, taskName:string) => {
    await invokeAndAssert({
      _handler, mockEvent:eventMock,
      incomingPayload: {
        task: taskName,
        parameters: {
          email: "explosion@gmail.com", 
          entity_id: "explode", 
          role: Roles.RE_AUTH_IND
        }
      },
      expectedResponse: {
        statusCode: 500,
        outgoingBody: { 
          message: `Invitation failure: abc123`,
          payload: { error: true  }
        }
      }
    });
  },
  differentRoleInvitation: async (_handler:any, eventMock:any, taskName:string) => {
    await invokeAndAssert({
      _handler, mockEvent:eventMock,
      incomingPayload: {
        task: taskName,
        parameters: {
          email: "invitedPeer@gmail.com", 
          entity_id: 'id_for_entity_with_peer_invitation_for_auth_ind', 
          role: Roles.RE_AUTH_IND
        }
      },
      expectedResponse: {
        statusCode: 200,
        outgoingBody: { 
          message: `Invitation successfully sent: abc123`,
          payload: { ok: true, invitation_code: 'abc123', invitation_link: 'non-sysadmin-signup-link' }
        }
      }
    });
  },
  retractedSameRole: async (_handler:any, eventMock:any, taskName:string) => {
    await invokeAndAssert({
      _handler, mockEvent:eventMock,
      incomingPayload: {
        task: taskName,
        parameters: {
          email: "invitedButRetracted@gmail.com", 
          entity_id: 'id_for_entity_with_retracted_invitation_for_re_admin', 
          role: Roles.RE_ADMIN
        }
      },
      expectedResponse: {
        statusCode: 200,
        outgoingBody: { 
          message: `Invitation successfully sent: abc123`,
          payload: { ok: true, invitation_code: 'abc123', invitation_link: 'non-sysadmin-signup-link' }
        }
      }
    });
  },
  send200: async (_handler:any, eventMock:any, taskName:string) => {
    await invokeAndAssert({
      _handler, mockEvent:eventMock,
      incomingPayload: {
        task: taskName,
        parameters: {
          email: "invitee@gmail.com", 
          entity_id: 'id_for_active_entity', 
          role: Roles.RE_AUTH_IND
        }
      },
      expectedResponse: {
        statusCode: 200,
        outgoingBody: { 
          message: `Invitation successfully sent: abc123`,
          payload: { ok: true, invitation_code: 'abc123', invitation_link: 'non-sysadmin-signup-link' }
        }
      }
    });
  },
  send200SysAdmin: async (_handler:any, eventMock:any, taskName:string) => {
    await invokeAndAssert({
      _handler, mockEvent:eventMock,
      incomingPayload: {
        task: taskName,
        parameters: {
          email: "sysadmin@gmail.com", 
          role: Roles.SYS_ADMIN
        }
      },
      expectedResponse: {
        statusCode: 200,
        outgoingBody: { 
          message: `Invitation successfully sent: abc123`,
          payload: { ok: true, invitation_code: 'abc123', invitation_link: 'sysadmin-signup-link' }
        }
      }
    });
  },
}

export const EntityLookupTests = {
  ignoreInactiveUsers: async (_handler:any, eventMock:any, taskName:string) => {
    await invokeAndAssert({
      _handler, mockEvent:eventMock,
      incomingPayload: {
        task: taskName,
        parameters: {
          email: inactiveUser.email, 
          role: Roles.RE_ADMIN
        }
      },
      expectedResponse: {
        statusCode: 200,
        outgoingBody: {
          message: 'Ok',
          payload: { ok: true, user: {}}
        }
      }
    });
  },
  userLookup: async (_handler:any, eventMock:any, taskName:string, scenario:MockingScenario) => {

    // Expected info comprises a daffy duck 2 user object with entity_id replaced by the full
    // entity object and that entity object having been appended the two other users of the entity.
    const expectedUserInfo1 = Object.assign({}, daffyduck1) as any;
    expectedUserInfo1.entity = {
      entity_id: 'warnerbros', entity_name: 'Warner Bros.', active: YN.Yes,
      users: [ Object.assign({}, porkypig), Object.assign({}, bugsbunny) ]
    };
    const expectedUserInfo2 = Object.assign({}, daffyduck2) as any;
    expectedUserInfo2.entity = {
      entity_id: 'cartoonville', entity_name: 'Cartoon Villiage', active: YN.Yes,
      users: [ Object.assign({}, yosemitesam), Object.assign({}, foghornLeghorn) ]
    };
    delete expectedUserInfo1.entity_id;
    delete expectedUserInfo1.entity.users[0].entity_id;
    delete expectedUserInfo1.entity.users[1].entity_id;
    delete expectedUserInfo2.entity_id;
    delete expectedUserInfo2.entity.users[0].entity_id;
    delete expectedUserInfo2.entity.users[1].entity_id;

    let expectedUserInfo;
    switch(scenario.UserLookup) {
      case "normal":
        expectedUserInfo = expectedUserInfo1;
        break;
      case "waitingroom":
        expectedUserInfo = expectedUserInfo2;
        break;
      case "multi-match":
        expectedUserInfo = [ expectedUserInfo2, expectedUserInfo1 ];
        break;
    }

    currentScenario = scenario;
    await invokeAndAssert({
      _handler, mockEvent:eventMock,
      incomingPayload: {
        task: taskName,
        parameters: {
          email: 'daffyduck@warnerbros.com',
          role: Roles.RE_ADMIN,
        }
      },
      expectedResponse: {
        statusCode: 200,
        outgoingBody: {
          message: 'Ok',
          payload: { ok: true, user: expectedUserInfo }
        }
      }
    });
  }
}