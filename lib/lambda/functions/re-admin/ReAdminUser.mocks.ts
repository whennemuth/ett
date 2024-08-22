import { UpdateItemCommandOutput } from "@aws-sdk/client-dynamodb";
import { IncomingPayload, OutgoingBody } from "../../../role/AbstractRole";
import { DAOEntity, DAOInvitation, DAOUser, FactoryParms } from "../../_lib/dao/dao";
import { ENTITY_WAITING_ROOM } from "../../_lib/dao/dao-entity";
import { Entity, Invitation, Role, Roles, User, YN } from "../../_lib/dao/entity";
import { MockCalls, TestParms, invokeAndAssert } from "../../UtilsTest";

/**
 * Keeps track of how many times any method of any mock has been called.
 */
const mockCalls = new MockCalls();

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
      mockCalls.update('lookupSingleUser');
      if(email === 'exists@gmail.com') {
        return {
          email, entity_id, role:Roles.RE_AUTH_IND
        } as User;
      }
      return null;
    },
    lookupUser: async (email:string): Promise<User[]> => {
      mockCalls.update('lookupUser');
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
      mockCalls.update('lookupPendingInvitations');
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
      mockCalls.update('lookupSingleActiveEntity');
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
      mockCalls.update('lookupEmail');
      switch(Username) {
        case 're_admin_foreign_entity_sub':
          return 'reAdmin@foreignEntity.net';
        case 're_admin_same_entity_sub':
          return 'reAdmin@sameEntity.net';
        case 'daffy_duck_sub':
          return daffyduck1.email;
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
          mockCalls.update('invitation.send');
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
          mockCalls.update('getCognitoLinkForRole');
          return 'sysadmin-signup-link';
        },
        getRegistrationLink: async (entity_id?:string):Promise<string|undefined> => {
          mockCalls.update('getRegistrationLink');
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
const entity1 = { entity_id:'warnerbros', entity_name: 'Warner Bros.', active: YN.Yes } as Entity;
const entity2 = { entity_id:'cartoonville', entity_name: 'Cartoon Villiage', active: YN.Yes } as Entity;
export type MockingScenario = {
  UserLookup: 'normal' | 'waitingroom' | 'multi-match'
};
let currentScenario:MockingScenario;

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
              mockCalls.update('user.read');
              switch(email) {
                case 'inactiveUser@gmail.com':
                  return [ inactiveUser ] as User[]
                case daffyduck1.email:
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
                case foghornLeghorn.email:
                  return [ foghornLeghorn ];
                case yosemitesam.email:
                  return [ yosemitesam ];
              }
              switch(entity_id) {
                case 'warnerbros':
                  return [ daffyduck1, porkypig, bugsbunny ];
                case 'cartoonville':
                  return [ daffyduck2, yosemitesam, foghornLeghorn ]
              }
              return [] as User[];
            },
            migrate: async (entity_name:string):Promise<any> => {
              mockCalls.update('user.migrate');
              return;
            }
          } as DAOUser;
        }

        if(parms.DAOType == 'entity') {
          return {
            read: async ():Promise<Entity|null> => {
              mockCalls.update('entity.read');
              switch(entity_id) {
                case 'warnerbros':
                  return entity1;
                case 'cartoonville':
                  return entity2;
              }
              return null;
            },
            create: async ():Promise<UpdateItemCommandOutput> => {
              mockCalls.update('entity.create');
              return { } as UpdateItemCommandOutput;
            },
            id: ():string => {
              mockCalls.update('entity.id');
              return 'new_entity_id';
            }
          } as DAOEntity;
        }

        if(parms.DAOType == 'invitation') {
          return {
            read: async ():Promise<(Invitation|null)|Invitation[]> => {
              mockCalls.update('invitation.read');
              return [
                { } as Invitation
              ] as Invitation[];
            },
            update: async ():Promise<UpdateItemCommandOutput> => {
              mockCalls.update('invitation.update');
              return { } as UpdateItemCommandOutput;
            }
          } as DAOInvitation;
        }

        return null;
      })
    }
  }
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
          message: `Missing parameters parameter for invite-user`, 
          payload: { invalid: true  }
        }
      }, 
      _handler, mockEvent: eventMock,
      incomingPayload: { task: 'invite-user' } as IncomingPayload
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
      cognitoSub: 're_admin_foreign_entity_sub'
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
      cognitoSub: 're_admin_same_entity_sub'
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

export const CreateEntityTests = {
  missingEntity: async (_handler:any, eventMock:any, task:string) => {
    const parms = {
      _handler, mockEvent:eventMock,
      incomingPayload: { task, parameters: { } },
      expectedResponse: {
        statusCode: 400,
        outgoingBody: {
          message: '',
          payload: { invalid: true  }
        }
      },
      cognitoSub: 'daffy_duck_sub'
    } as TestParms;
    parms.expectedResponse.outgoingBody.message = 'Cannot proceed with unspecified entity';
    await invokeAndAssert(parms);

    parms.incomingPayload.parameters = { entity_name: '' };
    await invokeAndAssert(parms);
  },
  successful: async (_handler:any, eventMock:any, task:string) => {
    const parms = {
      _handler, mockEvent:eventMock,
      incomingPayload: { task, parameters: { } },
      expectedResponse: {
        statusCode: 200,
        outgoingBody: {
          message: 'Ok',
          payload: { ok: true, entity_id: 'new_entity_id' }
        }
      },
      cognitoSub: 'daffy_duck_sub'
    } as TestParms;

    parms.incomingPayload.parameters = { entity_name: 'Boston University' };
    await invokeAndAssert(parms);
  }
};

const getCreateAndInviteTestsBaseParms = (task:string, _handler:any, mockEvent:any) => { 
  return {
  _handler, mockEvent,
  incomingPayload: {
    task,
    parameters: {
      entity: {
        entity_name: 'Boston University',
        description: 'Boston University'
      },
      invitations: {
        invitee1: {
          email: daffyduck1.email, role:Roles.RE_AUTH_IND
        },
        invitee2: {
          email: foghornLeghorn.email, role:Roles.RE_AUTH_IND
        }
      }
    }
  },
  expectedResponse: {
    statusCode: 400,
    outgoingBody: {
      message: ``,
      payload: { invalid: true }
    }
  }
} as TestParms; }

export const CreateAndInviteTests = {
  missingEntity: async (_handler:any, eventMock:any, taskName:string) => {
    const parms = getCreateAndInviteTestsBaseParms(taskName, _handler, eventMock);
    parms.expectedResponse.outgoingBody.message = 'Cannot proceed with unspecified entity';
    parms.incomingPayload.parameters['entity'] = undefined;
    await invokeAndAssert(parms);
    parms.incomingPayload.parameters['entity'] = { };
    await invokeAndAssert(parms);
    parms.incomingPayload.parameters['entity'] = { entity_name: '' };    
    await invokeAndAssert(parms);
  },
  missingAuthInd: async (_handler:any, eventMock:any, taskName:string) => {
    const parms1 = getCreateAndInviteTestsBaseParms(taskName, _handler, eventMock);
    parms1.expectedResponse.outgoingBody.message = `Cannot create entity ${parms1.incomingPayload.parameters['entity'].entity_name} since invitee1 is missing/incomplete`;
    parms1.incomingPayload.parameters.invitations['invitee1'] = undefined;
    await invokeAndAssert(parms1);
    parms1.incomingPayload.parameters.invitations['invitee1'] = { };
    await invokeAndAssert(parms1);
    parms1.incomingPayload.parameters.invitations['invitee1'] = { email: '', role:Roles.RE_AUTH_IND };
    await invokeAndAssert(parms1);
    parms1.incomingPayload.parameters.invitations = undefined;
    await invokeAndAssert(parms1);

    const parms2 = getCreateAndInviteTestsBaseParms(taskName, _handler, eventMock);
    parms2.expectedResponse.outgoingBody.message = `Cannot create entity ${parms2.incomingPayload.parameters['entity'].entity_name} since invitee2 is missing/incomplete`;
    parms2.incomingPayload.parameters.invitations['invitee2'] = undefined;
    await invokeAndAssert(parms2);
    parms2.incomingPayload.parameters.invitations['invitee2'] = { };
    await invokeAndAssert(parms2);
    parms2.incomingPayload.parameters.invitations['invitee2'] = { email: '', role:Roles.RE_AUTH_IND };
    await invokeAndAssert(parms2);
  },
  duplicateEmails: async (_handler:any, eventMock:any, taskName:string) => {
    const parms = getCreateAndInviteTestsBaseParms(taskName, _handler, eventMock);
    const email1 = parms.incomingPayload.parameters.invitations['invitee1'].email as string;
    const email2 =  email1.toUpperCase();
    parms.incomingPayload.parameters.invitations['invitee2'].email = email2;
    parms.expectedResponse.outgoingBody.message = `Cannot invite two authorized individuals with the same email: ${email1}`;
    await invokeAndAssert(parms);
  },
  successful: async (_handler:any, eventMock:any, taskName:string) => {
    const parms = getCreateAndInviteTestsBaseParms(taskName, _handler, eventMock);
    // Change to yosemite sam because he's an authorized indivdual and won't get filtered off by lookupEntity
    parms.incomingPayload.parameters.invitations['invitee1'] = yosemitesam;
    parms.expectedResponse = {
      statusCode: 200,
      outgoingBody: {
        message: 'Ok',
      }
    };
    mockCalls.reset();
    const body = await invokeAndAssert(parms, true);
    const { user } = body.payload;
    expect(user.email).toEqual(yosemitesam.email);
    expect(user.entity).toEqual(entity2);
    expect(mockCalls.called('entity.create')).toEqual(1);
    expect(mockCalls.called('invitation.send')).toEqual(2);
  }
};
