/**
 * Money is handled in integer millimes (1 BHD = 1000 millimes) end to end:
 * the database stores numeric(12,3) and every calculation here is integer
 * arithmetic, so no binary floating point ever touches an amount.
 * BHD is a 3-decimal currency.
 */
export const MILLIMES_PER_BHD = 1000;

export type Millimes = number & { readonly __brand: "Millimes" };

export class MoneyError extends Error {}

/** Parse a decimal string ("12.500") or number into integer millimes. */
export function toMillimes(value: string | number): Millimes {
  const raw = typeof value === "number" ? value.toFixed(3) : value.trim();
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(raw)) {
    throw new MoneyError(`invalid amount: ${raw}`);
  }
  const [intPart, fracPart = ""] = raw.split(".");
  const milli = Number(intPart) * MILLIMES_PER_BHD + Number((fracPart + "000").slice(0, 3));
  return milli as Millimes;
}

/** Render millimes back as a 3-decimal string for the database. */
export function fromMillimes(value: Millimes | number): string {
  const v = Math.trunc(value);
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  const int = Math.floor(abs / MILLIMES_PER_BHD);
  const frac = abs % MILLIMES_PER_BHD;
  return `${sign}${int}.${String(frac).padStart(3, "0")}`;
}

export function addMillimes(a: number, b: number): Millimes {
  return (Math.trunc(a) + Math.trunc(b)) as Millimes;
}

/**
 * Lesson price = hourly rate x (duration / 60) x lesson-type multiplier.
 * Integer math with half-up rounding; the multiplier is a milli value
 * (1000 = 1.000) exactly as stored in lesson_types.price_multiplier.
 */
export function lessonAmountMilli(
  pricePerHourMilli: number,
  durationMinutes: number,
  priceMultiplierMilli: number,
): Millimes {
  if (durationMinutes <= 0) throw new MoneyError("duration must be positive");
  if (pricePerHourMilli <= 0) throw new MoneyError("hourly rate must be positive");
  if (priceMultiplierMilli <= 0) throw new MoneyError("multiplier must be positive");
  const numerator = Math.trunc(pricePerHourMilli) * durationMinutes * Math.trunc(priceMultiplierMilli);
  const denominator = 60 * MILLIMES_PER_BHD;
  return Math.round(numerator / denominator) as Millimes;
}

export interface PriceBreakdown {
  /** price_per_hour stored on the booking (millimes) */
  hourlyMilli: Millimes;
  durationMinutes: number;
  multiplierMilli: number;
  /** final amount the customer pays (millimes) */
  totalMilli: Millimes;
  /** decimal strings, ready for numeric columns / WhatsApp copy */
  hourly: string;
  total: string;
}

export function priceBreakdown(
  pricePerHour: string | number,
  durationMinutes: number,
  priceMultiplier: string | number,
): PriceBreakdown {
  const hourly = toMillimes(pricePerHour);
  const multiplier = toMillimes(priceMultiplier);
  const total = lessonAmountMilli(hourly, durationMinutes, multiplier);
  return {
    hourlyMilli: hourly,
    durationMinutes,
    multiplierMilli: multiplier,
    totalMilli: total,
    hourly: fromMillimes(hourly),
    total: fromMillimes(total),
  };
}

/** Deposit/refund style percentage helper (integer math, half-up). */
export function percentOfMilli(amountMilli: number, percent: number): Millimes {
  return Math.round((Math.trunc(amountMilli) * percent) / 100) as Millimes;
}
