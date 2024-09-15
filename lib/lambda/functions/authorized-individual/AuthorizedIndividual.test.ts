import { SESv2Client, SendEmailCommand, SendEmailCommandInput, SendEmailResponse } from '@aws-sdk/client-sesv2';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse, OutgoingBody } from '../../../role/AbstractRole';
import { DAOUser, FactoryParms } from '../../_lib/dao/dao';
import { Roles, User } from '../../_lib/dao/entity';
import { deepClone } from '../../Utils';
import { Task, handler } from './AuthorizedIndividual';
import { expectedCommandInput } from './DemolitionCommandInputMock';
import { bugsbunny, daffyduck, entity, yosemitesam } from './MockObjects';

const deletedUsers = [ bugsbunny, daffyduck, yosemitesam ] as User[];
const dryRun = false;
const demolish = async ():Promise<any> => expectedCommandInput;

enum Scenario { NORMAL, UNMATCHABLE_ENTITY, NON_EMAILS };
let currentScenario = Scenario.NORMAL as Scenario;

jest.mock('./Demolition', () => {
  return {
    EntityToDemolish: jest.fn().mockImplementation(() => {
      switch(currentScenario) {
        case Scenario.NORMAL:
          return { demolish, dryRun, entity, deletedUsers };
        case Scenario.UNMATCHABLE_ENTITY:
          return { demolish, dryRun, entity:undefined, deletedUsers };
        case Scenario.NON_EMAILS:
          // Daffy and bugs have non-emails, while yosemite sam retains a real email address.
          const daffy = deepClone(daffyduck);
          daffy.email = 'invitation_code';
          const bugs = deepClone(bugsbunny);
          bugs.email = 'invitation_code'
          return { demolish, dryRun, entity, deletedUsers: [ daffy, bugs, yosemitesam ] };
      }      
    })
  };
});

const mockUserRead = jest.fn(async ():Promise<User[]> => {
  return new Promise((resolve) => {
    resolve([ {
      email: 'sysadmin1@bu.edu', role: Roles.SYS_ADMIN
    } as User, {
      email: 'sysadmin2@bu.edu', role: Roles.SYS_ADMIN
    } as User ] as User[]);
  });
}) as any;

// Mock the lookup for the system administrator used as the from address for demolition ses notifications.
jest.mock('../../_lib/dao/dao.ts', () => {
  return {
    __esModule: true,
    DAOFactory: {
      getInstance: jest.fn().mockImplementation((parms:FactoryParms) => {
        switch(parms.DAOType) {
          case 'user': 
            return { read: mockUserRead } as DAOUser;
          case 'entity':
            return null;
          case 'invitation':
            return null;
          case 'consenter':
            return null;
          case 'config':
            return null;
        }
      })
    }
  }
});

describe('AuthInd lambda trigger: pre-task validation', () => {
  it('Should respond with a 400 status code if a missing or unrecognized task is provided', async () => {

    // Missing task
    let event = {
      headers: {
        [AbstractRoleApi.ETTPayloadHeader]: JSON.stringify({
          parameters: { }
        } as IncomingPayload)
      }
    } as any;
    let response = await handler(event) as LambdaProxyIntegrationResponse;
    expect(response.statusCode).toEqual(400);
    let body = JSON.parse(response.body ?? '{}');
    expect(body).toEqual({ 
      message: `Bad Request: Invalid/Missing task parameter: undefined`,
      payload: { invalid:true } 
    } as OutgoingBody);

    // Bogus task
    event = {
      headers: {
        [AbstractRoleApi.ETTPayloadHeader]: JSON.stringify({
          task: 'BOGUS',
          parameters: { }
        } as IncomingPayload)
      }
    } as any;
    response = await handler(event) as LambdaProxyIntegrationResponse;
    expect(response.statusCode).toEqual(400);
    body = JSON.parse(response.body ?? '{}');
    expect(body).toEqual({ 
      message: `Bad Request: Invalid/Missing task parameter: BOGUS`,
      payload: { invalid:true } 
    } as OutgoingBody);
  });

  it('Should respond with a 400 status code if the parameters attribute is missing', async () => {
    const event = {
      headers: {
        [AbstractRoleApi.ETTPayloadHeader]: JSON.stringify({
          task: Task.DEMOLISH_ENTITY
        } as IncomingPayload)
      }
    } as any;
    const response = await handler(event) as LambdaProxyIntegrationResponse;
    expect(response.statusCode).toEqual(400);
    const body = JSON.parse(response.body ?? '{}');
    expect(body).toEqual({ 
      message: `Bad Request: Missing parameters parameter for ${Task.DEMOLISH_ENTITY}`,
      payload: { invalid:true } 
    } as OutgoingBody);
  });
});

describe('AuthInd lambda trigger: demolition', () => {
  let emailsSent = [] as string[];
  const sesClientMock = mockClient(SESv2Client);
  const { entity_id } = entity;
  const incomingPayload = {
    task: Task.DEMOLISH_ENTITY,
    parameters: { entity_id, dryRun:false }
  } as IncomingPayload;
  const event = {
    headers: {
      [AbstractRoleApi.ETTPayloadHeader]: JSON.stringify(incomingPayload)
    }
  } as any;
  const UserPoolId = 'user_pool_ID';
  process.env.USERPOOL_ID = UserPoolId;

  // Keep track of what emails are sent.
  sesClientMock.on(SendEmailCommand).callsFake((input:SendEmailCommandInput) => {
    if(input.Destination?.ToAddresses) {
      emailsSent.push(input.Destination?.ToAddresses[0]);
    }    
    return {
      MessageId: 'some_alpha-numeric_value'
    } as SendEmailResponse
  });



  it('Should send an email to every user that was deleted from the system', async () => {
    currentScenario = Scenario.NORMAL;
    jest.restoreAllMocks();

    const response = await handler(event) as LambdaProxyIntegrationResponse;

    const emailsThatShouldHaveBeenSent = [ bugsbunny.email, daffyduck.email, yosemitesam.email ];
    expect(response.statusCode).toEqual(200);
    expect(response.body).toBeDefined();
    expect(emailsSent).toEqual(emailsThatShouldHaveBeenSent);
  });

  it('Should NOT send any emails if notify is set to false', async () => {
    currentScenario = Scenario.NORMAL;
    jest.restoreAllMocks();
    emailsSent = [] as string[];

    // Set up an event that specifies no email notifications upon demolition completion.
    const _incomingPayload = deepClone(incomingPayload) as IncomingPayload;
    _incomingPayload.parameters.notify = false;
    const _event = {
      headers: {
        [AbstractRoleApi.ETTPayloadHeader]: JSON.stringify(_incomingPayload)
      }
    } as any;

    const response = await handler(_event) as LambdaProxyIntegrationResponse;
    expect(response.statusCode).toEqual(200);
    expect(response.body).toBeDefined();
    expect(emailsSent.length).toEqual(0);
  });

  it('Should NOT send an email to any user that was deleted who is still in the entity waiting room', async () => {
    currentScenario = Scenario.NON_EMAILS;
    jest.restoreAllMocks();
    emailsSent = [] as string[];

    const response = await handler(event) as LambdaProxyIntegrationResponse;

    const emailsThatShouldHaveBeenSent = [ yosemitesam.email ];
    expect(response.statusCode).toEqual(200);
    expect(response.body).toBeDefined();
    expect(emailsSent).toEqual(emailsThatShouldHaveBeenSent);
  });

  it('Should respond with a 400 status code if no entity is specified', async () => {
    currentScenario = Scenario.NON_EMAILS;
    jest.restoreAllMocks();
    emailsSent = [] as string[];

    // Set up an event that specifies no email notifications upon demolition completion.
    const _incomingPayload = deepClone(incomingPayload) as IncomingPayload;
    _incomingPayload.parameters.entity_id = undefined;
    const _event = {
      headers: {
        [AbstractRoleApi.ETTPayloadHeader]: JSON.stringify(_incomingPayload)
      }
    } as any;

    const response = await handler(_event) as LambdaProxyIntegrationResponse;
    expect(response.statusCode).toEqual(400);
    const body = JSON.parse(response.body ?? '{}');
    expect(body).toEqual({ 
      message: 'Bad Request: Missing entity_id parameter',
      payload: { invalid:true } 
    } as OutgoingBody);
  });

  it('Should respond with a 400 status code lookup against specified entity_id fails', async () => {
    currentScenario = Scenario.UNMATCHABLE_ENTITY;
    jest.restoreAllMocks();
    emailsSent = [] as string[];

    const response = await handler(event) as LambdaProxyIntegrationResponse;
    expect(response.statusCode).toEqual(400);
    const body = JSON.parse(response.body ?? '{}');
    expect(body).toEqual({ 
      message: `Bad Request: Invalid entity_id: ${entity_id}`,
      payload: { invalid:true } 
    } as OutgoingBody);
  });

});