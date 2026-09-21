/**
 * Availability and conflict arithmetic.
 *
 * Bahrain is UTC+03:00 all year (no daylight saving), so lesson wall-clock time
 * maps to an instant with a fixed offset. That is stated once here instead of
 * relying on the host's time zone database, which would make the same booking
 * valid on one machine and invalid on another.
 *
 * Everything in this module is pure: given the tutor's template, their time
 * off, the bookings already holding slots and the platform's booking rules, it
 * answers "is this request bookable?" - and the database still enforces the
 * final word with an exclusion constraint.
 */
import { slotHoldingStatuses, type BookingStatus } from "./state";

export const BAHRAIN_UTC_OFFSET_HOURS = 3;
export const DEFAULT_SLOT_STEP_MINUTES = 30;

export interface DateISO {
  /** `YYYY-MM-DD`, Bahrain local calendar date */
  date: string;
  /** `HH:MM` or `HH:MM:SS`, Bahrain local time */
  time: string;
}

export interface AvailabilityWindow {
  /** 0 = Sunday ... 6 = Saturday (Bahraini week) */
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface BusyRange {
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
}

export interface BookingRules {
  /** how far ahead a lesson may be booked */
  maxAdvanceDays: number;
  /** minimum time between submitting the request and the lesson */
  minLeadTimeHours: number;
  /** allowed lesson lengths in minutes */
  allowedDurations: number[];
}

export const defaultBookingRules: BookingRules = {
  maxAdvanceDays: 60,
  minLeadTimeHours: 12,
  allowedDurations: [30, 45, 60, 90, 120],
};

export type AvailabilityCode =
  | "ok"
  | "past"
  | "too_far_ahead"
  | "too_soon"
  | "outside_availability"
  | "time_off"
  | "conflict"
  | "bad_duration"
  | "bad_time";

export interface AvailabilityResult {
  ok: boolean;
  code: AvailabilityCode;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// ---------------------------------------------------------------------------
// Parsing and arithmetic
// ---------------------------------------------------------------------------

export function parseDateParts(date: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

export function parseTimeToMinutes(time: string): number | null {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const s = m[3] ? Number(m[3]) : 0;
  if (h > 23 || mi > 59 || s > 59) return null;
  return h * 60 + mi + (s >= 30 ? 1 : 0) * 0; // seconds are ignored, not rounded
}

/** Bahrain local wall clock -> absolute instant. */
export function toInstant(date: string, time: string): Date | null {
  const parts = parseDateParts(date);
  const minutes = parseTimeToMinutes(time);
  if (!parts || minutes === null) return null;
  const utcMs = Date.UTC(parts.y, parts.m - 1, parts.d, 0, 0, 0) + (minutes - BAHRAIN_UTC_OFFSET_HOURS * 60) * MINUTE;
  return new Date(utcMs);
}

/** Bahrain calendar date of an instant, as `YYYY-MM-DD`. */
export function localDateOf(instant: Date): string {
  const shifted = new Date(instant.getTime() + BAHRAIN_UTC_OFFSET_HOURS * HOUR);
  return shifted.toISOString().slice(0, 10);
}

/** Bahrain weekday of a calendar date: 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(date: string): number | null {
  const parts = parseDateParts(date);
  if (!parts) return null;
  return new Date(Date.UTC(parts.y, parts.m - 1, parts.d)).getUTCDay();
}

/** Whole days between two calendar dates (b - a). */
export function daysBetween(a: string, b: string): number | null {
  const pa = parseDateParts(a);
  const pb = parseDateParts(b);
  if (!pa || !pb) return null;
  const ms = Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d);
  return Math.round(ms / (24 * HOUR));
}

/** Half-open interval overlap: identical boundaries do NOT conflict. */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MINUTE);
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export interface AvailabilityInput {
  date: string;
  time: string;
  durationMinutes: number;
  windows: AvailabilityWindow[];
  timeOff: { startsAt: Date; endsAt: Date }[];
  busy: BusyRange[];
  rules?: BookingRules;
  /** injectable clock so the rules are testable */
  now?: Date;
}

export function checkAvailability(input: AvailabilityInput): AvailabilityResult {
  const rules = input.rules ?? defaultBookingRules;
  const now = input.now ?? new Date();

  if (!rules.allowedDurations.includes(input.durationMinutes)) {
    return { ok: false, code: "bad_duration" };
  }
  const start = toInstant(input.date, input.time);
  if (!start) return { ok: false, code: "bad_time" };
  const end = addMinutes(start, input.durationMinutes);

  // date sanity
  const today = localDateOf(now);
  const dayDelta = daysBetween(today, input.date);
  if (dayDelta === null) return { ok: false, code: "bad_time" };
  if (dayDelta < 0) return { ok: false, code: "past" };
  if (dayDelta > rules.maxAdvanceDays) return { ok: false, code: "too_far_ahead" };
  if (start.getTime() - now.getTime() < rules.minLeadTimeHours * HOUR) {
    return { ok: false, code: "too_soon" };
  }

  const weekday = weekdayOf(input.date);
  if (weekday === null) return { ok: false, code: "bad_time" };

  // the requested range must sit inside ONE availability window
  const startMinutes = parseTimeToMinutes(input.time);
  if (startMinutes === null) return { ok: false, code: "bad_time" };
  const endMinutes = startMinutes + input.durationMinutes;
  const fits = input.windows.some((w) => {
    if (w.weekday !== weekday) return false;
    const wStart = parseTimeToMinutes(w.startTime);
    const wEnd = parseTimeToMinutes(w.endTime);
    if (wStart === null || wEnd === null) return false;
    return startMinutes >= wStart && endMinutes <= wEnd;
  });
  if (!fits) return { ok: false, code: "outside_availability" };

  for (const off of input.timeOff) {
    if (overlaps(start, end, off.startsAt, off.endsAt)) return { ok: false, code: "time_off" };
  }

  // only statuses that hold a slot can conflict
  for (const b of input.busy) {
    if (!slotHoldingStatuses.includes(b.status)) continue;
    if (overlaps(start, end, b.startsAt, b.endsAt)) return { ok: false, code: "conflict" };
  }

  return { ok: true, code: "ok" };
}

/**
 * Candidate start times for a calendar date. Returned in Bahrain local time.
 * Used by the booking UI; the same rules are re-checked on the server.
 */
export function availableSlots(
  date: string,
  durationMinutes: number,
  input: Omit<AvailabilityInput, "date" | "time" | "durationMinutes">,
  stepMinutes = DEFAULT_SLOT_STEP_MINUTES,
): string[] {
  const out: string[] = [];
  const weekday = weekdayOf(date);
  if (weekday === null) return out;
  for (const w of input.windows) {
    if (w.weekday !== weekday) continue;
    const wStart = parseTimeToMinutes(w.startTime);
    const wEnd = parseTimeToMinutes(w.endTime);
    if (wStart === null || wEnd === null) continue;
    for (let m = wStart; m + durationMinutes <= wEnd; m += stepMinutes) {
      const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const res = checkAvailability({ ...input, date, time, durationMinutes });
      if (res.ok) out.push(time);
    }
  }
  return [...new Set(out)].sort();
}
