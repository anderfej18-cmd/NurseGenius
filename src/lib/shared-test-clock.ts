// Time on the public test page. The database's clock decides when a test opens, closes and runs out; the
// browser's clock may be wrong, so every moment shown is computed against the server's idea of "now".

/** How far the server's clock is ahead of the browser's, in milliseconds (negative when behind). */
export const clockOffset = (serverNowIso: string, clientNowMs: number): number =>
  Date.parse(serverNowIso) - clientNowMs;

/** The server's current time, given the browser's and the offset measured when the server last answered. */
export const serverTime = (offset: number, clientNowMs: number): number => clientNowMs + offset;

/** Whole seconds until a moment on the server's clock, rounded up so "0" means it has arrived. */
export function secondsUntil(targetIso: string, offset: number, clientNowMs: number): number {
  return Math.max(0, Math.ceil((Date.parse(targetIso) - serverTime(offset, clientNowMs)) / 1000));
}

export interface CountdownParts {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
}

export function countdownParts(totalSeconds: number): CountdownParts {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return {
    days: Math.floor(safe / 86_400),
    hours: Math.floor((safe % 86_400) / 3600),
    minutes: Math.floor((safe % 3600) / 60),
    seconds: safe % 60,
  };
}

const unit = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "2 days 3 hours", "4 minutes 10 seconds": the two largest units that are not zero, for a screen reader. */
export function countdownWords(totalSeconds: number): string {
  const { days, hours, minutes, seconds } = countdownParts(totalSeconds);
  const parts = [
    ...(days > 0 ? [unit(days, "day")] : []),
    ...(hours > 0 ? [unit(hours, "hour")] : []),
    ...(minutes > 0 ? [unit(minutes, "minute")] : []),
    ...(days === 0 && hours === 0 ? [unit(seconds, "second")] : []),
  ];
  return parts.slice(0, 2).join(" ");
}
