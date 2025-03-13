const humanizeDuration = require("humanize-duration");

// What humanize-duration considers to be the number of milliseconds in each unit of time
const defaults = { 
  y: 31557600000, 
  mo: 2629800000, 
  w: 604800000, 
  d: 86400000, 
  h: 3600000, 
  m: 60000, 
  s: 1000, 
  ms: 1 
}

export const humanReadableFromMilliseconds = (duration:number): string => {
  const { d, y } = defaults;
  let units = ["y", "mo", "w", "d", "h", "m", "s"];
  if(duration >= d && duration < y) {
    // favor expressing time in days even if it is greater than a week or a month, until you get to years.
    units = [ "d", "h", "m", "s", "ms" ];
  }
  return humanizeDuration(duration, { units });
}

export const humanReadableFromSeconds = (duration:number): string => humanReadableFromMilliseconds(duration * 1000);

export const humanReadableFromMinutes = (duration:number): string => humanReadableFromSeconds(duration * 60);

export const humanReadableFromHours = (duration:number): string => humanReadableFromMinutes(duration * 60);

export const humanReadableFromDays = (duration:number): string => humanReadableFromHours(duration * 24);

/**
 * RUN MANUALLY
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/timer/DurationConverter.ts')) {

  console.log(humanReadableFromSeconds(2592000));
}
