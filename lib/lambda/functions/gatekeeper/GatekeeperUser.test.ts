import { AbstractRoleApi } from '../../../role/AbstractRole';
import { Response, handler } from './GatekeeperUser';
import { mockEvent } from './MockEvent';

const setPayloadHeader = (payload:string) => {
  mockEvent.headers[AbstractRoleApi.ETTPayloadHeader as keyof typeof mockEvent.headers] = payload;
}

describe('GatekeeperUser lambda trigger: handler', () => {

  it('Should handle a simple ping test as expected', async () => {
    setPayloadHeader('{ "task": "ping", "parameters": { "ping": true}}');
    const response:Response = await handler(mockEvent);
    const { statusCode:respStatCode, body } = response;
    expect(respStatCode).toEqual(200);
    const bodyObj = JSON.parse(body || '{}');
    const { statusCode:bodyStatCode, statusDescription, message, payload } = bodyObj;
    expect(bodyStatCode).toEqual(200);
    expect(statusDescription).toEqual('OK');
    expect(message).toEqual('Ping!');
    expect(payload).toEqual({ ping:true });
  });

  it('Should handle missing ettpayload with 400 status code', async () => {
    setPayloadHeader('');
    const response:Response = await handler(mockEvent);
    const { statusCode:respStatCode, body } = response;
    expect(respStatCode).toEqual(400);
    const bodyObj = JSON.parse(body || '{}');
    const { statusCode:bodyStatCode, statusDescription, message, payload } = bodyObj;
    expect(bodyStatCode).toEqual(400);
    expect(statusDescription).toEqual('Bad Request');
    expect(message).toEqual('Invalid/Missing task parameter: undefined');
    expect(payload).toEqual({ error: true });
  });

  it('Should handle a bogus task value with 400 status code', async () => {
    setPayloadHeader('{ "task": "bogus" }');
    const response:Response = await handler(mockEvent);
    const { statusCode:respStatCode, body } = response;
    expect(respStatCode).toEqual(400);
    const bodyObj = JSON.parse(body || '{}');
    const { statusCode:bodyStatCode, statusDescription, message, payload } = bodyObj;
    expect(bodyStatCode).toEqual(400);
    expect(statusDescription).toEqual('Bad Request');
    expect(message).toEqual('Invalid/Missing task parameter: bogus');
    expect(payload).toEqual({ error: true });
  });

});