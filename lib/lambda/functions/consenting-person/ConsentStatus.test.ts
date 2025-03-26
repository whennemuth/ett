import { Consenter, YN } from "../../_lib/dao/entity";
import { ConsentStatus, consentStatus, getLatestDate } from "./ConsentStatus";

const { ACTIVE, FORTHCOMING, RESCINDED } = ConsentStatus;

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
  
  it('Should return forthcoming if the consenter has neither consented nor rescinded', () => {
    const consenter = {
      email: 'myself@mymail.com',
      active: YN.No,
      consented_timestamp: [],
      rescinded_timestamp: [],
      renewed_timestamp: []
    } as Consenter;
    expect(consentStatus(consenter)).toEqual(FORTHCOMING);
  });
  
  it('Should return active if the consenter has consented once and not rescinded', () => {
    const consenter = {
      email: 'myself@mymail.com',
      active: YN.Yes,
      consented_timestamp: [ new Date().toISOString() ],
      rescinded_timestamp: [],
      renewed_timestamp: []
    } as Consenter;
    expect(consentStatus(consenter)).toEqual(ACTIVE);
  });
  
  it('Should return rescinded if the consenter has consented once then rescinded', () => {
    const consented = new Date();
    const rescinded = new Date(consented.getTime() + 1000);
    const consenter = {
      email: 'myself@mymail.com',
      active: YN.No,
      consented_timestamp: [ consented.toISOString() ],
      rescinded_timestamp: [ rescinded.toISOString() ],
      renewed_timestamp: []
    } as Consenter;
    expect(consentStatus(consenter)).toEqual(RESCINDED);
  });
  
  it('Should return active if the consenter has re-consented as their last action', () => {
    const consented1 = new Date();
    const rescinded = new Date(consented1.getTime() + 1000);
    const consented2 = new Date(rescinded.getTime() + 1000);
    const consenter = {
      email: 'myself@mymail.com',
      active: YN.No,
      consented_timestamp: [ consented1.toISOString(), consented2.toISOString() ],
      rescinded_timestamp: [ rescinded.toISOString() ],
      renewed_timestamp: []
    } as Consenter;
    expect(consentStatus(consenter)).toEqual(ACTIVE);
  });

  it('Should return active if the consenter has renewed as their last action', () => {
    const consented = new Date();
    const rescinded = new Date(consented.getTime() + 1000);
    const renewed = new Date(rescinded.getTime() + 1000);
    const consenter = {
      email: 'myself@mymail.com',
      active: YN.No,
      consented_timestamp: [ consented.toISOString() ],
      rescinded_timestamp: [ rescinded.toISOString() ],
      renewed_timestamp: [ renewed.toISOString() ]
    } as Consenter;
    expect(consentStatus(consenter)).toEqual(ACTIVE);
  });
  
});