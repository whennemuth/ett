import { Configurations } from "../../_lib/config/Config";
import { ConfigNames, Consenter, YN } from "../../_lib/dao/entity";
import { error } from "../../Utils";

export enum ConsentStatus {
  ACTIVE = 'active',
  FORTHCOMING = 'forthcoming',
  RESCINDED = 'rescinded',
  EXPIRED = 'expired',
}

export const consentStatus = async (consenter:Consenter):Promise<ConsentStatus> => {
  const { active=YN.No, consented_timestamp=[], rescinded_timestamp=[], renewed_timestamp=[] } = consenter;
  const { ACTIVE, FORTHCOMING, RESCINDED, EXPIRED } = ConsentStatus;

  // If consenter never consented, there is nothing to rescind or expire, so return forthcoming
  if(consented_timestamp.length == 0) {
    return FORTHCOMING;
  }

  // Get the milliseconds of the latest consent, rescind, and renew entries.
  const latestConsent = getLatestTime(consented_timestamp);
  const latestRescind = getLatestTime(rescinded_timestamp);
  const latestRenew = getLatestTime(renewed_timestamp);

  // If both the latest consent and renewal happened further in the past than the expiration interval, 
  // then the consenter is expired
  const { getAppConfig } = new Configurations();
  const { CONSENT_EXPIRATION } = ConfigNames;
  const millisecondsToExpire = (await getAppConfig(CONSENT_EXPIRATION)).getDuration() * 1000;
  const now = Date.now();
  if((latestConsent > latestRenew ? latestConsent : latestRenew) + millisecondsToExpire < now) {
    return EXPIRED;
  }

  // If nothing has been rescinded at this point, then the consenter is active
  if(latestRescind == 0) {
    return ACTIVE;
  }

  // If the latest rescind is greater than the latest consent and renewal, then the consenter is rescinded
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

