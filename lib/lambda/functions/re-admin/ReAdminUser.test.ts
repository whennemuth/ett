import { handler } from './ReAdminUser'

describe('re-admin-user', () => {
  it('Should return nothing', async() => {
    const handlerResult = await handler({
      headers: {
        ApiParameters: {
          parm1: 'testparm'
        }
      }
    });
    expect(handlerResult).toBeUndefined();
  })
});

