import { UserInvitation } from './Invitation';
import 'aws-sdk-client-mock-jest';
import { mockClient } from 'aws-sdk-client-mock';
import { SESv2Client, SendEmailCommand, SendEmailCommandInput, SendEmailResponse } from '@aws-sdk/client-sesv2';
import { Invitation, roleFullName, Roles } from '../dao/entity';
import { DAOInvitation } from '../dao/dao';
import { Actions } from '../../../role/AbstractRole';
import { DelayedExecutions } from '../../../DelayedExecution';
import { ID as coreId} from '../../functions/delayed-execution/RemoveStaleInvitations';
import { EggTimer } from '../timer/EggTimer';
import { makeSafeHtml } from '../EmailWithAttachments';

const invitationParms = {
  email: 'somebody@gmail.com',
  role: Roles.RE_AUTH_IND
} as Invitation;

const entity_name = 'Boston University';
const link = `https://some/path/to/index.htm?action=${Actions.register_entity}`;

let daoInviteAttempts = 0;
let registered = false;
let preRegistered = ():boolean => registered;
jest.mock('../../_lib/dao/dao.ts', () => {
  return {
    __esModule: true,
    DAOFactory: {
      getInstance: jest.fn().mockImplementation((parms:any) => {
        registered = parms?.Payload?.registered_timestamp ? true : false;
        return {
          create: async ():Promise<any> => {
            daoInviteAttempts++;
            return new Promise((resolve, reject) => {
              if(daoInviteAttempts == 1) {
                // First attempt should throw an error (first test expects an error)
                reject('Failed to create invitation in dynamodb');
              }
              else {
                // All subsequent attempts should be ok.
                resolve({
                  testField: 'test-value'
                });
              }
            });
          }
        } as DAOInvitation
      })
    }
  }
});

// Mock the startCountdown function of the DelayedLambdaExecution class
let countdownStartedWithId:string;
jest.mock('../../_lib/timer/DelayedExecution', () => {
  return {
    __esModule: true,
    DelayedLambdaExecution: jest.fn().mockImplementation(() => {
      return {
        // startCountdown: jest.fn().mockResolvedValue(true)
        startCountdown: async (timer:EggTimer, Name:string, Description?:string):Promise<any> => {
          countdownStartedWithId = Name;
          return true;
        }
      };
    })
  }
});


describe('Send', () => {
  let sesCalls = 0;
  const sesClientMock = mockClient(SESv2Client);

  let sesInput:SendEmailCommandInput;
  sesClientMock.on(SendEmailCommand).callsFake((input:SendEmailCommandInput) => {
    sesCalls++;
    if(sesCalls == 1) {
      throw new Error('Failed to send email');
    }
    sesInput = input;
    return {
      MessageId: 'some_alpha-numeric_value'
    } as SendEmailResponse
  });

  it('Should use the ses service send command, and return false if an error is encountered', async () => {
    const invitation = new UserInvitation(invitationParms, link, entity_name);
    expect(await invitation.send({ expires:true, persist:true })).toBe(false);
    expect(sesCalls).toEqual(1);
    expect(daoInviteAttempts).toEqual(0);
  });

  it('Should use the ses service send command, and return true if no error is encountered', async () => {
    const invitation = new UserInvitation(invitationParms, link, entity_name);
    expect(await invitation.send({ expires:true, persist:true })).toBe(true);
    expect(sesCalls).toEqual(2);
    expect(daoInviteAttempts).toEqual(1);
  });

  it('Should generate its own code if none is supplied', async () => {
    const invitation = new UserInvitation(invitationParms, link, entity_name);
    expect(await invitation.send({ expires:true, persist:true })).toBe(true);
    expect(daoInviteAttempts).toEqual(2);
    expect(invitation.code).toBeDefined();
    expect(invitation.code).toMatch(/^[^\s]+$/);
    expect(preRegistered()).toBe(false);
  });

  it('Should pre-register a system administrator', async () => {
    const sysAdminInvParms = Object.assign({}, invitationParms);
    sysAdminInvParms.role = Roles.SYS_ADMIN;
    const invitation = new UserInvitation(sysAdminInvParms, link, entity_name);
    expect(await invitation.send({ expires:true, persist:true })).toBe(true);
    expect(daoInviteAttempts).toEqual(3);
    expect(invitation.code).toBeDefined();
    expect(invitation.code).toMatch(/^[^\s]+$/);
    expect(preRegistered()).toBe(true);
  })

  it('Should configure the ses email as expected', async () => {
    const { email, role } = invitationParms;
    const invitation = new UserInvitation(invitationParms, link, entity_name);
    const envVarName = DelayedExecutions.RemoveStaleInvitations.targetArnEnvVarName;
    const coreName = DelayedExecutions.RemoveStaleInvitations.coreName;
    const region = 'us-east-2';
    const accountId = '037860335094';
    process.env[envVarName] = `arn:aws:lambda:${region}:${accountId}:function:${coreName}`;
    expect(await invitation.send({ expires:true, persist:true })).toBe(true);
    expect(invitation.code).toBeDefined();
    expect(countdownStartedWithId).toEqual(coreId);
    expect(sesInput.Destination?.ToAddresses).toContain(email);
    // Convert the sesInput.Content.raw UIntArray to a string
    expect(sesInput.Content?.Raw?.Data).toBeDefined();
    const rawData = Buffer.from(sesInput.Content?.Raw?.Data as Uint8Array).toString('utf-8');
    expect(rawData).toContain('From: "Ethical Transparency Tool (ETT)"');
    expect(rawData).toContain(entity_name);
    expect(rawData).toContain(roleFullName(Roles.RE_AUTH_IND));
    expect(rawData).toContain(makeSafeHtml(`${link}&code=${invitation.code}`));
    expect(daoInviteAttempts).toEqual(4);
  });  
});

