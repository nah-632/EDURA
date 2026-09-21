/**
 * Booking date/time helpers.
 *
 * `bookings.starts_at` is a `timestamp` (wall clock, no zone). The pg driver
 * turns that into a JS Date using the SERVER's local time, which on Vercel is
 * UTC - so reading the column directly and formatting it shifts every lesson by
 * three hours. Everything therefore either selects `scheduled_date`/`start_time`
 * as text, or converts explicitly through this module.
 */
export const BAHRAIN_OFFSET = "+03:00";

/** Wall-clock Bahrain date+time as a real instant. */
export function bahrainInstant(dateISO: string, timeHHMM: string): Date {
  const time = timeHHMM.length === 5 ? `${timeHHMM}:00` : timeHHMM;
  return new Date(`${dateISO}T${time}${BAHRAIN_OFFSET}`);
}

/** `2026-09-20` + `16:30:00` -> `2026-09-20T16:30:00+03:00` (for SQL/text). */
export function bahrainISO(dateISO: string, timeHHMM: string): string {
  const time = timeHHMM.length === 5 ? `${timeHHMM}:00` : timeHHMM;
  return `${dateISO}T${time}${BAHRAIN_OFFSET}`;
}

/** `HH:MM:SS` or `HH:MM` -> `HH:MM`. */
export function shortTime(value: string): string {
  return value.slice(0, 5);
}

/** Minutes since midnight for a `HH:MM[:SS]` string. */
export function minutesOfDay(value: string): number {
  const [h = "0", m = "0"] = value.split(":");
  return Number(h) * 60 + Number(m);
}

/** Today's date in Bahrain, regardless of where the server runs. */
export function bahrainToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bahrain",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // en-CA renders as YYYY-MM-DD
}

/** Whole days between two ISO date-only strings. */
export function daysBetween(fromISO: string, toISO: string): number {
  const from = Date.parse(`${fromISO}T00:00:00Z`);
  const to = Date.parse(`${toISO}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}
