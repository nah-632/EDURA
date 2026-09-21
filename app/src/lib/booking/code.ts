/**
 * Booking ID: EDU-DDMMYYYY-XXXX (e.g. EDU-26092026-0001).
 *
 * The number is allocated by the database function `next_booking_code(day)`
 * (see 0000_init.sql) so two simultaneous requests can never take the same
 * sequence. This module only formats, parses and validates the ID.
 */
export const BOOKING_CODE_PREFIX = "EDU";

const CODE_RE = /^EDU-(\d{2})(\d{2})(\d{4})-(\d{4})$/;

export function formatBookingCode(date: Date, sequence: number): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getUTCFullYear());
  const seq = Math.trunc(sequence);
  if (seq < 1 || seq > 9999) throw new RangeError("booking sequence out of range (1..9999)");
  return `${BOOKING_CODE_PREFIX}-${dd}${mm}${yyyy}-${String(seq).padStart(4, "0")}`;
}

export interface ParsedBookingCode {
  /** `YYYY-MM-DD` */
  date: string;
  sequence: number;
}

export function parseBookingCode(code: string): ParsedBookingCode | null {
  const m = CODE_RE.exec(code.trim().toUpperCase());
  if (!m) return null;
  const [, dd, mm, yyyy, seq] = m;
  const day = Number(dd);
  const month = Number(mm);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return { date: `${yyyy}-${mm}-${dd}`, sequence: Number(seq) };
}

export function isBookingCode(value: string): boolean {
  return parseBookingCode(value) !== null;
}
