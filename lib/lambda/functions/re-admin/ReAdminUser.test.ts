import { CognitoLookupMock, InvitationMock, ParameterValidationTests, SignupLinkMock, UserInvitationTests, UtilsMock } from './ReAdminUser.mocks';

process.env.CLOUDFRONT_DOMAIN = 'dnkkwr06vb9yr.cloudfront.net';

// Create the partial mock for Utils.ts module
jest.mock('../Utils.ts', () => {
  const originalModule = jest.requireActual('../Utils.ts');
  return UtilsMock(originalModule);
});  

// Create the mock for the es6 UserInvitation class
jest.mock('../../_lib/invitation/Invitation', () => {
  return InvitationMock();
});

// Create the mock for the SignupLink.ts module
jest.mock('../../_lib/invitation/SignupLink.ts', () => {
  const originalModule = jest.requireActual('../../_lib/invitation/SignupLink.ts');
  return SignupLinkMock();
});

// Create the mock for the cognito Lookup.ts module
jest.mock('../../_lib/cognito/Lookup.ts', () => {
  const originalModule = jest.requireActual('../../_lib/cognito/Lookup.ts');
  return CognitoLookupMock(originalModule);
});

import { mockEvent } from './MockEvent';
import { Task, handler } from './ReAdminUser';

describe('ReAdminUser lambda trigger: handler', () => {
  it('Should handle a simple ping test as expected', async () => {
    await ParameterValidationTests.pingTest(handler, mockEvent);
  });
  it('Should handle missing ettpayload with 400 status code', async () => {
    await ParameterValidationTests.missingPayload(handler, mockEvent);
  });
  it('Should handle a bogus task value with 400 status code', async () => {
    await ParameterValidationTests.bogusTask(handler, mockEvent);
  });
});

describe('ReAdminUser lambda trigger: inviteUser', () => {
  it('Should return 400 if attempting to invite any role other than RE_AUTH_IND', async () => {
    await UserInvitationTests.reAdminInvitesWrongRole(handler, mockEvent, Task.INVITE_USER);
  })
  it('Should return 400 if user has already accepted an invitation for same role in same entity', async () => {
    await UserInvitationTests.alreadyAccepted(handler, mockEvent, Task.INVITE_USER);
  });
  it('Should return 400 if the invitation is to an entity that has been deactivated', async () => {
    await UserInvitationTests.deactivatedEntity(handler, mockEvent, Task.INVITE_USER);
  });
  it('Should return 400 if an RE_ADMIN invites someone to an entity they are not found themselves to be a member of.', async () => {
    await UserInvitationTests.authIndInviteFromForeignEntity(handler, mockEvent, Task.INVITE_USER);
  });
  it('Should return 200 if an RE_ADMIN invites someone to an entity they are found to be a member of.', async () => {
    await UserInvitationTests.authIndInviteFromSameEntity(handler, mockEvent, Task.INVITE_USER);
  });
  it('Should return 400 if an AUTH_IND is invited to an entity that cannot be found by entity_id', async () => {
    await UserInvitationTests.authIndInviteToNoSuchEntity(handler, mockEvent, Task.INVITE_USER);
  });
  it('Should return 500 if there was an error while sending invitation', async () => {
    await UserInvitationTests.sendError(handler, mockEvent, Task.INVITE_USER);
  });
  it('Should return 200 if an invitation exists for the entity, but for a different role', async () => {
    await UserInvitationTests.differentRoleInvitation(handler, mockEvent, Task.INVITE_USER);
  });
  it('Should return 200 if a second invitation is being made for AUTH_IND for same entity', async () => {
    await UserInvitationTests.outstandingInvitationAuthInd(handler, mockEvent, Task.INVITE_USER);
  })
  it('Should return 200 if all validity criterion are met', async () => {
    await UserInvitationTests.send200(handler, mockEvent, Task.INVITE_USER);
  });
});