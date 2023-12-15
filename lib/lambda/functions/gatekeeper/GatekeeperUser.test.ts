import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse } from '../../../role/AbstractRole';
import { handler } from './GatekeeperUser';
import { mockEvent } from './MockEvent';

const setPayloadHeader = (payload:string|IncomingPayload) => {
  if(typeof payload == 'string') {
    mockEvent.headers[AbstractRoleApi.ETTPayloadHeader as keyof typeof mockEvent.headers] = payload as string;
  }
  if(typeof payload == 'object') {
    const payloadStr:string = JSON.stringify(payload);
    mockEvent.headers[AbstractRoleApi.ETTPayloadHeader as keyof typeof mockEvent.headers] = payloadStr;
  }
}

describe('GatekeeperUser lambda trigger: handler', () => {

  it('Should handle a simple ping test as expected', async () => {
    const mockPayload = {
      task: 'ping',
      parameters: {
        ping: true
      }
    } as IncomingPayload;
    setPayloadHeader(mockPayload);
    const response:LambdaProxyIntegrationResponse = await handler(mockEvent);
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
    const response:LambdaProxyIntegrationResponse = await handler(mockEvent);
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
    const response:LambdaProxyIntegrationResponse = await handler(mockEvent);
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