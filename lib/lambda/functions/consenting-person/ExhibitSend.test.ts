import { SendAffiliateData } from "./ExhibitSend.mocks";
import { mockEvent } from './MockEvent';
import { Task, INVALID_RESPONSE_MESSAGES as msgs } from './ConsentingPerson';
import { Config, ConfigNames } from "../../_lib/dao/entity";
import { Configurations } from "../../_lib/config/Config";

const sleep = async (ms:number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Jest tests run in parallel by default. This can cause problems when the tests are trying to access 
 * the same MockCalls instance to register a new database call. The MockCalls instance is cleared at the
 * beginning of each test, but if tests overlap due to running in parallel, activity registered in one 
 * test will bleed into the next making the assertions for how many times certain database calls have been
 * made inaccurate. This is a workaround to run the tests as if in sequence. The tests are still run 
 * in parallel, but each will wait for the previous test to complete before proceeding further.
 */
let parallelCalls = 0;
const waitForCompletionOfPriorTest = async () => {
  if(parallelCalls > 0) {
    while(parallelCalls > 0) {
      await sleep(10);
    }
  }
}

beforeEach(() => {
  waitForCompletionOfPriorTest().then(() => {
    parallelCalls += 1;
  });
});
afterEach(() => {
  parallelCalls -= 1;
});

describe(`Consenting Person lambda trigger: ${Task.SEND_EXHIBIT_FORM}`, () => {
  const task = Task.SEND_EXHIBIT_FORM;

  const tenYearsOfSeconds = '315360000';
  const testConfigSet = { 
    useDatabase: false, 
    configs: [{
      name: ConfigNames.CONSENT_EXPIRATION,
      value: tenYearsOfSeconds,
      config_type: 'duration',
      description: 'Duration an individuals consent is valid for before it automatically expires'
    }] as Config[],
  };

  process.env[Configurations.ENV_VAR_NAME] = JSON.stringify(testConfigSet);
  
  it('Should return invalid response if exhibit data is missing', async () => {
    await SendAffiliateData.missingExhibitData(mockEvent, task, msgs.missingExhibitData); 
  });
  it('Should return invalid response if entity_id is missing', async () => {
    await SendAffiliateData.missingEntityId(mockEvent, task, msgs.missingEntityId); 
  });
  it('Should return invalid response if affiliate records is/are missing', async () => {
    await SendAffiliateData.missingAffiliateRecords(mockEvent, task, msgs.missingAffiliateRecords); 
  });
  it('Should return invalid response if email of exhibit issuer is missing', async () => {
    await SendAffiliateData.missingEmail(mockEvent, task, msgs.missingExhibitFormIssuerEmail); 
  });
  it('Should return invalid response if exhibit issuer has not consented', async () => {
    await SendAffiliateData.missingConsent(mockEvent, task, msgs.missingConsent);
  });
  it('Should return invalid response if exhibit issuer has retracted their consent', async () => {
    await SendAffiliateData.rescindedConsent(mockEvent, task, msgs.missingConsent);
  });
  it('Should return ok response if exhibit issuer has consented, but is inactive', async () => {
    await SendAffiliateData.consenterInactive(mockEvent, task);
  });
  it('Should behave as expected if error is encountered looking up the entity', async () => {
    await SendAffiliateData.entityLookupFailure(mockEvent, task);
  });
  it('Should behave as expected if error is encountered looking up users', async () => {
    await SendAffiliateData.userLookupFailure(mockEvent, task);
  });
  it('Should behave as expected if error is encountered sending emails', async () => {
    await SendAffiliateData.sendEmailFailure(mockEvent, task, `Internal server error: ${msgs.emailFailures}`);
  }); 
  it('Should behave as expected no errors are encountered', async () => {
    await SendAffiliateData.sendEmailOk(mockEvent, task);
  }); 
});