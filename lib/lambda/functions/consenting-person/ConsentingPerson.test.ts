import { DaoMock, ExhibitEmailMock, ParameterValidationTests, SendAffiliateData } from "./ConsentingPerson.mocks";

// Create the mock for the es6 ExhibitEmail class
const exhibitEmailMock = jest.mock('../../functions/consenting-person/ExhibitEmail.ts', () => {
  return ExhibitEmailMock();
});

// Create the mock for the DAOFactory class
const daoMock = jest.mock('../../_lib/dao/dao.ts', () => {
  const originalModule = jest.requireActual('../../_lib/dao/dao.ts');
  return DaoMock(originalModule);
});

import { mockEvent } from './MockEvent';
import { Task, handler, INVALID_RESPONSE_MESSAGES as msgs } from './ConsentingPerson';

describe('Consenting Person lambda trigger: handler', () => {
  it('Should handle a simple ping test as expected', async () => {
    await ParameterValidationTests.pingTest(handler, mockEvent, Task.PING);
  });
  it('Should handle missing ettpayload with 400 status code', async () => {
    const task = `${Task.SEND_AFFILIATE_DATA}`;
    await ParameterValidationTests.missingPayload(handler, mockEvent, task, `${msgs.missingTaskParms} ${task}`);
  });
  it('Should handle a bogus task value with 400 status code', async () => {
    const task = 'bogus-task';
    await ParameterValidationTests.bogusTask(handler, mockEvent, task, `${msgs.missingOrInvalidTask} ${task}`);
  });
});

describe('Consenting Person lambda trigger: send-affliate-data', () => {
  const task = Task.SEND_AFFILIATE_DATA;
  it('Should return invalid response if exhibit data is missing', async () => {
    await SendAffiliateData.missingExhibitData(handler, mockEvent, task, msgs.missingExhibitData); 
  });
  it('Should return invalid response if entity_id is missing', async () => {
    await SendAffiliateData.missingEntityId(handler, mockEvent, task, msgs.missingEntityId); 
  });
  it('Should return invalid response if affiliate records is/are missing', async () => {
    await SendAffiliateData.missingAffiliateRecords(handler, mockEvent, task, msgs.missingAffiliateRecords); 
  });
  it('Should return invalid response if email of exhibit issuer is missing', async () => {
    await SendAffiliateData.missingEmail(handler, mockEvent, task, msgs.missingEmail); 
  });
  it('Should behave as expected if error is encountered looking up the entity', async () => {
    await SendAffiliateData.entityLookupFailure(handler, mockEvent, task);
  });
  it('Should behave as expected if error is encountered looking up users', async () => {
    await SendAffiliateData.userLookupFailure(handler, mockEvent, task);
  });
  it('Should behave as expected if error is encountered sending emails', async () => {
    await SendAffiliateData.sendEmailFailure(handler, mockEvent, task, msgs.emailFailure);
  }); 
  it('Should behave as expected no errors are encountered', async () => {
    await SendAffiliateData.sendEmailOk(handler, mockEvent, task);
  }); 
});