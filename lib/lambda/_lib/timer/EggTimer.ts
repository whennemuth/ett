

export enum PeriodType {
  MILLISECONDS=1, SECONDS=1000, MINUTES=60000, HOURS=3600000, DAYS=86400000, WEEKS=604800000
}

/**
 * A simple class for converting a specified number of human readable intervals (hours, days, etc) to a
 * date object that represents the point in time reached if one waits for those intervals to pass.
 */
export class EggTimer {
  private expirationDate:Date;
  private milliseconds:number;

  /**
   * Factory method for getting an egg timer instance.
   * @param periods 
   * @param periodType 
   * @param offsetDate Prior date that specifies a point in the past to indicate as the starting point of the 
   * egg timer "countdown". This way the timer starts its "countdown" already partially elapsed. Useful if
   * you want one egg timer instance to "take over" for another one.  
   * @returns 
   */
  public static getInstanceSetFor = (periods:number, periodType:PeriodType, offsetDate?:Date):EggTimer => {
    const millisecondsNow = offsetDate ? offsetDate.getTime() : Date.now();
    const millisecondsDelay = periods * periodType;
    const timer = new EggTimer(new Date(millisecondsNow + millisecondsDelay));
    timer.milliseconds = periods * periodType;
    return timer;
  }

  constructor(expirationDate:Date) {
    this.expirationDate = expirationDate;
  }

  /**
   * @returns The date of the timer expiration
   */
  public getExpirationDate = ():Date => {
    return this.expirationDate;
  }
  /**
   * @returns The number of milliseconds to timer expiration
   */
  public getMilliseconds = ():number => {
    return this.milliseconds;
  }

  /**
   * @returns A cron expression that represents the single point in time (non-recurring) of the expiration date.
   */
  public getCronExpression = ():string => {
    const { expirationDate:dte} = this;
    const minutes = dte.getUTCMinutes();
    const hours = dte.getUTCHours();
    const dayOfMonth = dte.getUTCDate();
    const month = dte.getUTCMonth() + 1;  // getUTCMonth() returns 0-based month
    const year = dte.getUTCFullYear();
    return `cron(${minutes} ${hours} ${dayOfMonth} ${month} ? ${year})`;
  }

  /**
   * Run the a function that begins with some kind of delay (await) and ends with execution.
   * @param run 
   */
  public startTimer = async (run:Function):Promise<void> => {
    await run();
  }
}
