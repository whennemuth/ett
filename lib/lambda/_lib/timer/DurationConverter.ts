const humanizeDuration = require("humanize-duration");

export const humanReadableFromMilliseconds = (duration:number): string => humanizeDuration(duration);

export const humanReadableFromSeconds = (duration:number): string => humanReadableFromMilliseconds(duration * 1000);

export const humanReadableFromMinutes = (duration:number): string => humanReadableFromSeconds(duration * 60);

export const humanReadableFromHours = (duration:number): string => humanReadableFromMinutes(duration * 60);

export const humanReadableFromDays = (duration:number): string => humanReadableFromHours(duration * 24);

/**
 * RUN MANUALLY
 */
const { argv:args } = process;
if(args.length > 2 && args[2].replace(/\\/g, '/').endsWith('lib/lambda/_lib/timer/DurationConverter.ts')) {

  console.log(humanReadableFromSeconds(300));
}
