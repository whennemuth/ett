import { CognitoLookupMock, InvitationMock, ParameterValidationTests, UserInvitationTests, UtilsMock } from '../re-admin/ReAdminUser.mocks';

process.env.CLOUDFRONT_DOMAIN = 'dnkkwr06vb9yr.cloudfront.net';

// Create the partial mock for Utils.ts module
jest.mock('../Utils.ts', () => {
  const originalModule = jest.requireActual('../Utils.ts');
  return UtilsMock(originalModule);
});  

// Create the mock es6 class for UserInvitation
jest.mock('../../_lib/invitation/Invitation', () => {
  return InvitationMock();
});

// Create the mock for the cognito Lookup.ts module
jest.mock('../../_lib/cognito/Lookup.ts', () => {
  const originalModule = jest.requireActual('../../_lib/cognito/Lookup.ts');
  return CognitoLookupMock(originalModule);
});

import { mockEvent } from './MockEvent';
import { Task as SysAdminTask, handler } from './SysAdminUser';
import { Task as ReAdminTask } from '../re-admin/ReAdminUser';

describe('SysAdminUser lambda trigger: handler', () => {
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

describe('SysAdminUser lambda trigger: inviteUser', () => {
  it('Should return 400 if user has already accepted an invitation for same role in same entity', async () => {
    await UserInvitationTests.alreadyAccepted(handler, mockEvent, ReAdminTask.INVITE_USER);
  });
  it('Should return 400 if someone else already has an outstanding RE_ADMIN invitation in same entity', async () => {
    await UserInvitationTests.outstandingInvitationReAdmin(handler, mockEvent, ReAdminTask.INVITE_USER);
  });
  it('Should return 400 if the invitation is to an entity that has been deactivated', async () => {
    await UserInvitationTests.deactivatedEntity(handler, mockEvent, ReAdminTask.INVITE_USER);
  });
  it('Should return 400 if an AUTH_IND is invited to an entity that cannot be found by entity_id', async () => {
    await UserInvitationTests.authIndInviteToNoSuchEntity(handler, mockEvent, ReAdminTask.INVITE_USER);
  });
  it('Should return 500 if there was an error while sending invitation', async () => {
    await UserInvitationTests.sendError(handler, mockEvent, ReAdminTask.INVITE_USER);
  });
  it('Should return 200 if an invitation exists for the entity, but for a different role', async () => {
    await UserInvitationTests.differentRoleInvitation(handler, mockEvent, ReAdminTask.INVITE_USER);
  });
  it('Should return 200 if an invitation exists for the same entity and role, but it is retracted', async () => {
    await UserInvitationTests.retractedSameRole(handler, mockEvent, ReAdminTask.INVITE_USER);
  })
  it('Should return 200 if all validity criterion are met', async () => {
    await UserInvitationTests.send200(handler, mockEvent, ReAdminTask.INVITE_USER);
  });
});