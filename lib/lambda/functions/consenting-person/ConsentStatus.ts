import { Consenter, YN } from "../../_lib/dao/entity";
import { error } from "../../Utils";

export enum ConsentStatus {
  ACTIVE = 'active',
  FORTHCOMING = 'forthcoming',
  RESCINDED = 'rescinded'
}

export const consentStatus = (consenter:Consenter):ConsentStatus => {
  const { active=YN.No, consented_timestamp=[], rescinded_timestamp=[], renewed_timestamp=[] } = consenter;
  const { ACTIVE, FORTHCOMING, RESCINDED } = ConsentStatus;

  // if(active == YN.Yes) {
  //   return ACTIVE;
  // }

  if(consented_timestamp.length == 0) {
    return FORTHCOMING;
  }

  const latestConsent = getLatestTime(consented_timestamp);
  const latestRescind = getLatestTime(rescinded_timestamp);
  const latestRenew = getLatestTime(renewed_timestamp);

  if(latestRescind == 0) {
    return ACTIVE;
  }

  if(latestRescind > latestConsent) {
    if( latestRescind > latestRenew) {
      return RESCINDED;
    }
  }
  if(active != YN.Yes) {
    error({ consenter }, `Invalid state: Consenters consent status is active, but active is not "${YN.Yes}"`);
  }
  return ACTIVE; 
}

export const getLatestDate = (datesArray:string[]|Date[]=[]):Date|void => {
  if( ! datesArray || datesArray.length == 0) {
    return;
  }

  // Map all dates to a new array as Dates in case they were an array of ISO formatted strings
  const dates = datesArray.map((d:string|Date) => {
    return new Date(d);
  });

  dates.sort((a:Date, b:Date) => {
    if(a.getTime() == b.getTime()) {
      return 0;
    }
    return a.getTime() > b.getTime() ? -1 : 1;
  });

  return dates[0];
}

export const getLatestTime = (datesArray:string[]|Date[]=[]):number => {
  const date = getLatestDate(datesArray);
  return date ? date.getTime() : 0;
}

