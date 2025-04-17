import { IncomingPayload, OutgoingBody } from '../../../role/AbstractRole';
import { invokeAndAssert } from '../../UtilsTest';
import { Task, handler, INVALID_RESPONSE_MESSAGES as msgs } from './ConsentingPerson';
import { mockEvent } from './MockEvent';

describe('Consenting Person lambda trigger: handler', () => {
  it('Should handle a simple ping test as expected', async () => {
    await invokeAndAssert({
      expectedResponse: { 
        statusCode: 200, 
        outgoingBody:{ message: 'Ping!', payload: { ok:true, ping:true }} as OutgoingBody 
      },
      _handler: handler, mockEvent,
      incomingPayload: { task:Task.PING, parameters: { ping: true } } as IncomingPayload
    }); 
  });
  it('Should handle missing ettpayload with 400 status code', async () => {
    const task = `${Task.SEND_EXHIBIT_FORM}`;
    await invokeAndAssert({
      expectedResponse: {
        statusCode: 400, 
        outgoingBody: { 
          message: `${msgs.missingTaskParms} ${task}`, 
          payload: { invalid: true  }
        }
      }, 
      _handler:handler, mockEvent,
      incomingPayload: { task } as IncomingPayload
    });
  });
  it('Should handle a bogus task value with 400 status code', async () => {
    const task = 'bogus-task';
    await invokeAndAssert({
      expectedResponse: {
        statusCode: 400,
        outgoingBody: { 
          message: `${msgs.missingOrInvalidTask} ${task}`,
          payload: { invalid: true  }
        }
      }, 
      _handler:handler, mockEvent,
      incomingPayload: { task } as IncomingPayload      
    })
  });
});
