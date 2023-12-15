import { InvitationEmail, InvitationEmailParameters } from './Invitation';
import 'aws-sdk-client-mock-jest';
import { mockClient } from 'aws-sdk-client-mock';
import { SESv2Client, SendEmailCommand, SendEmailCommandInput, SendEmailResponse } from '@aws-sdk/client-sesv2';
import { Roles } from '../dao/entity';
import { DAOInvitation } from '../dao/dao';
import { UpdateOutput } from '../dao/dao-invitation';

const emailParms = {
  email: 'bugs-bunny@warnerbros.com',
  entity_name: 'Boston University',
  link: 'https://path/and?querystring',
  role: Roles.RE_AUTH_IND
} as InvitationEmailParameters;

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
    const invitation = new InvitationEmail(emailParms);
    expect(await invitation.send()).toBe(false);
    expect(sesCalls).toEqual(1);
  });

  it('Should use the ses service send command, and return true if no error is encountered', async () => {
    const invitation = new InvitationEmail(emailParms);
    expect(await invitation.send()).toBe(true);
    expect(sesCalls).toEqual(2);
  }); 

  it('Should configure the ses email as expected', async () => {
    const invitation = new InvitationEmail(emailParms);
    expect(await invitation.send()).toBe(true);
    expect(sesInput.Destination?.ToAddresses).toContain(emailParms.email);
    expect(sesInput.Content?.Simple?.Subject?.Data).toEqual('INVITATION: Ethical Transparency Tool (ETT)');
    const html:string|undefined = sesInput.Content?.Simple?.Body?.Html?.Data;
    expect(html).toContain(emailParms.entity_name);
    expect(html).toContain(emailParms.link);
    expect(html).toContain(emailParms.role);
  });  
});

let daoInviteAttempts = 0;
let daoAcceptAttempts = 0;
jest.mock('../../_lib/dao/dao.ts', () => {
  return {
    __esModule: true,
    DAOFactory: {
      getInstance: jest.fn().mockImplementation(() => {
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
          },
          update: async ():Promise<UpdateOutput> => {
            daoAcceptAttempts++;
            return new Promise((resolve, reject) => {
              switch(daoAcceptAttempts) {
                case 1:
                  reject('Failed to read invitation from dynamodb');
                  break;
                case 2:
                  resolve({ append: [], update: [] });
                  break;
                case 3:
                  resolve({ append: [], update: [ 'something' ] });
                  break;
                case 4:
                  resolve({ append: [], update: [ 'something', 'and', 'something else' ] });
                  break;
              }
            });
          }
        } as DAOInvitation
      })
    }
  }
});

describe('Persist', () => {

  it('Should return false if an error occurs.', async () => {
    const invitation = new InvitationEmail(emailParms);
    expect(await invitation.persist()).toBe(false);
    expect(daoInviteAttempts).toEqual(1);
  });
  
  it('Should return true if no error occurs.', async () => {
    const invitation = new InvitationEmail(emailParms);
    expect(await invitation.persist()).toBe(true);
    expect(daoInviteAttempts).toEqual(2);
  });
});


describe('Accept', () => {

  it('Should return false if an error occurs', async () => {
    const invitation = new InvitationEmail(emailParms);
    expect(await invitation.accept()).toBe(false);
    expect(daoAcceptAttempts).toEqual(1);
  });

  it('Should return false if no matching invitation can be found', async () => {
    const invitation = new InvitationEmail(emailParms);
    expect(await invitation.accept()).toBe(false);
    expect(daoAcceptAttempts).toEqual(2);
  });

  it('Should return true if matching invitation is found for specific role among single result', async () => {
    const invitation = new InvitationEmail(emailParms);
    expect(await invitation.accept()).toBe(true);
    expect(daoAcceptAttempts).toEqual(3);
  });

  it('Should return true if matching invitation is found for specific role among multiple results', async () => {
    // NOTE: This could probably never happen because it would require more than one invitation for the 
    // same email, same entity, same role, and each sent at the identical point in time.
    const invitation = new InvitationEmail(emailParms);
    expect(await invitation.accept()).toBe(true);
    expect(daoAcceptAttempts).toEqual(4);
  });
});