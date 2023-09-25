import { handler } from '../ReAdminUser.mjs'

describe('re-admin-user', () => {
  it('Should return nothing', async() => {
    const handlerResult = await handler({
      message: 'hello'
    });
    expect(handlerResult).toBeUndefined();
  })
});

