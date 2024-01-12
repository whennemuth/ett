// RESUME NEXT 1: Write these tests.

import {} from './PreSignup';

describe('Pre signup lambda trigger: handler', () => {

  it('Should error out if there are no pending invitations');

  it('Should error out if there are pending invitations, but none that match by role');

  it('Should error out if only invitation attempts that match by role, but are already accepted');

  it('Should error out if only invitation attempts that match by role, but are retracted');

  it('Should try to accept a single pending invitation attempt that matches by role');

  it('Should try to accept all of multiple pending invitation attempts that match by role');
});