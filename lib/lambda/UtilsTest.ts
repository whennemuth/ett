import { AbstractRoleApi, IncomingPayload, LambdaProxyIntegrationResponse, OutgoingBody } from "../role/AbstractRole";

/**
 * Helper class used in unit tests to keep track of and reset calls to mocks.
 */
export class MockCalls {
  private commands = [] as any[];
  public update(name:string) {
    const idx = this.commands.findIndex((cmd) => cmd.name == name);
    if(idx == -1) {
      this.commands.push({name, calls:1});
      return;
    }
    const cmd = this.commands[idx];
    cmd.calls++;
    this.commands[idx] = cmd;
  }
  public called(name:string) {
    const cmd = this.commands.find((cmd) => cmd.name == name );
    return cmd ? cmd.calls : 0;
  }
  public reset() {
    this.commands = [];
  }
}

export type Expected = { statusCode:number, outgoingBody:OutgoingBody };

export type TestParms = { 
  expectedResponse:Expected, 
  incomingPayload:IncomingPayload, 
  mockEvent:any, 
  _handler:any,
  cognitoSub?:string
}

/**
 * Invoke the lambda function and check all supplied assertions about the response:
 *   1) Modify the mocked event object for the lambda function so that it includes a mock payload from supposed api request
 *   2) Invoke the lambda
 *   3) Assert the returned status code, message and payload
 * @returns 
 */
export const invokeAndAssert = async (testParms:TestParms, ignorePayload?:boolean) => {
  // Destructure the testParms
  const { _handler, expectedResponse, mockEvent, incomingPayload, cognitoSub } = testParms;
  const payloadStr:string = JSON.stringify(incomingPayload);
  
  // Inject the supplied payload and attributes into the mock event object
  mockEvent.headers[AbstractRoleApi.ETTPayloadHeader as keyof typeof mockEvent.headers] = payloadStr;
  if(cognitoSub) {
    mockEvent.requestContext.authorizer.claims.username = cognitoSub;
  } 
  else {
    // Reset the username attribute back to what it originally was.
    const sub = mockEvent.requestContext.authorizer.claims.sub
    mockEvent.requestContext.authorizer.claims.username = sub;
  }

  // Invoke the lambda function
  const response:LambdaProxyIntegrationResponse = await _handler(mockEvent);

  // Destructure the lambda function response
  const { statusCode, body } = response;
  const bodyObj = JSON.parse(body || '{}');
  const { message, payload:returnedPayload } = bodyObj;

  // Make all assertions
  const { message:expectedMessage} = expectedResponse.outgoingBody;
  expect(statusCode).toEqual(expectedResponse.statusCode);
  expect(message).toEqual(expectedMessage);
  if(ignorePayload) {
    return bodyObj;
  }
  const { payload:expectedPayload} = expectedResponse.outgoingBody;
  expect(returnedPayload).toEqual(expectedPayload);
  
  // Return the body of the response in case caller wants to make more assertions.
  return bodyObj;
}