import { IContext } from "../../../../contexts/IContext";
import { Configurations } from "../../_lib/config/Config";
import { Config, ConfigNames, Consenter, YN } from "../../_lib/dao/entity";
import { ConsentStatus, consentStatus, getLatestDate } from "./ConsentStatus";

const { ACTIVE, FORTHCOMING, RESCINDED, EXPIRED } = ConsentStatus;

describe('Determine the latest date', () => {

  it('Should return void if nothing is provided', () => {
    const dates:string[]|Date[]|undefined = undefined;
    expect(getLatestDate(dates)).toBeUndefined();
  });

  it('Should return void if an empty list of dates is provided', () => {
    const dates:string[]|Date[]|undefined = [];
    expect(getLatestDate(dates)).toBeUndefined();
  });

  it('Should return the same date if only one date is provided', () => {
    const date = new Date();
    const dates:string[]|Date[]|undefined = [ date.toISOString() ];
    const latest = getLatestDate(dates) as Date;;
    expect(latest).toBeDefined();
    expect(latest.getTime()).toEqual(date.getTime());
  });

  it('Should return the latest date if multiple dates are provided', () => {
    const date1 = new Date();
    const date2 = new Date(date1.getTime() + 1000);
    const date3 = new Date(date1.getTime() - 1000);
    const dates:string[]|Date[]|undefined = [ date1.toISOString(), date2.toISOString(), date3.toISOString() ];
    const latest = getLatestDate(dates) as Date;;
    expect(latest).toBeDefined();
    expect(latest.getTime()).toEqual(date2.getTime());
  });
});

describe('Determine the consent status', () => {
  const tenYearsOfSeconds = '315360000';
  const anotherMinuteOfSeconds = 60;
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

  const getConsentedUnrescindedConsenter = (offsetSeconds:number=0):Consenter => {
    const now = Date.now() - (offsetSeconds * 1000);
    return {
      email: 'myself@mymail.com',
      active: YN.Yes,
      consented_timestamp: [ new Date(now).toISOString() ],
      rescinded_timestamp: [],
      renewed_timestamp: []
    } as Consenter;
  }

  const getReConsentedConsenter = (offsetSeconds:number=0):Consenter => {
    const now = Date.now() - (offsetSeconds * 1000);
    const consented1 = new Date(now);
    const rescinded = new Date(consented1.getTime() + 1000);
    const consented2 = new Date(rescinded.getTime() + 1000);
    return {
      email: 'myself@mymail.com',
      active: YN.No,
      consented_timestamp: [ consented1.toISOString(), consented2.toISOString() ],
      rescinded_timestamp: [ rescinded.toISOString() ],
      renewed_timestamp: []
    } as Consenter;
  }

  const getRenewedConsenter = (offsetSeconds:number=0):Consenter => {
    const now = Date.now() - (offsetSeconds * 1000);
    const consented = new Date(now);
    const rescinded = new Date(consented.getTime() + 1000);
    const renewed = new Date(rescinded.getTime() + 1000);
    return {
      email: 'myself@mymail.com',
      active: YN.No,
      consented_timestamp: [ consented.toISOString() ],
      rescinded_timestamp: [ rescinded.toISOString() ],
      renewed_timestamp: [ renewed.toISOString() ]
    } as Consenter;
  }
  
  it('Should return forthcoming if the consenter has neither consented nor rescinded', async () => {
    const consenter = {
      email: 'myself@mymail.com',
      active: YN.No,
      consented_timestamp: [],
      rescinded_timestamp: [],
      renewed_timestamp: []
    } as Consenter;
    expect(await consentStatus(consenter)).toEqual(FORTHCOMING);
  });
  
  it('Should return rescinded if the consenter has consented once then rescinded', async () => {
    const consented = new Date();
    const rescinded = new Date(consented.getTime() + 1000);
    const consenter = {
      email: 'myself@mymail.com',
      active: YN.No,
      consented_timestamp: [ consented.toISOString() ],
      rescinded_timestamp: [ rescinded.toISOString() ],
      renewed_timestamp: []
    } as Consenter;
    expect(await consentStatus(consenter)).toEqual(RESCINDED);
  });
  
  it('Should return active if the consenter has consented once and not rescinded', async () => {
    expect(await consentStatus(getConsentedUnrescindedConsenter())).toEqual(ACTIVE);
  });
  
  it('Should return active if the consenter has re-consented as their last action', async () => {
    expect(await consentStatus(getReConsentedConsenter())).toEqual(ACTIVE);
  });

  it('Should return active if the consenter has renewed as their last action', async () => {
     expect(await consentStatus(getRenewedConsenter())).toEqual(ACTIVE);
  });

  it('Should return expired if the consenter has not consented or renewed in the required time', async () => {

    const goBackInTimeBy = parseInt(tenYearsOfSeconds) + anotherMinuteOfSeconds;

    expect(await consentStatus(getConsentedUnrescindedConsenter(goBackInTimeBy))).toEqual(EXPIRED);

    expect(await consentStatus(getReConsentedConsenter(goBackInTimeBy))).toEqual(EXPIRED);

    expect(await consentStatus(getRenewedConsenter(goBackInTimeBy))).toEqual(EXPIRED);

  });
  
});