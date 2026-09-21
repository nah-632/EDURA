/**
 * i18n engine: dictionary composition, translation and Bahrain-aware
 * formatting. One formatter per concern so no component hand-rolls a number,
 * a date or a currency string.
 *
 * Conventions locked here (Gulf/Bahrain):
 *  - Digits are LATIN in both languages ("12.500" not "١٢٫٥٠٠").
 *  - BHD keeps its three decimals - it is a 3-decimal currency.
 *  - Money is handled as a decimal STRING; floats are never used for it.
 */
import { common } from "./dict/common";
import { publicCopy } from "./dict/public";
import { bookingCopy } from "./dict/booking";
import { accountCopy } from "./dict/account";
import { tutorCopy } from "./dict/tutor";
import { adminCopy } from "./dict/admin";
import { legalCopy } from "./dict/legal";
import { trustCopy } from "./dict/trust";
import {
  DEFAULT_LOCALE,
  interpolate,
  isLocale,
  localeDir,
  localeMeta,
  otherLocale,
  type Dictionary,
  type Locale,
} from "./types";

export * from "./types";

export const dictionaries: Record<Locale, Dictionary> = {
  ar: { ...common.ar, ...publicCopy.ar, ...bookingCopy.ar, ...accountCopy.ar, ...tutorCopy.ar, ...adminCopy.ar, ...legalCopy.ar, ...trustCopy.ar },
  en: { ...common.en, ...publicCopy.en, ...bookingCopy.en, ...accountCopy.en, ...tutorCopy.en, ...adminCopy.en, ...legalCopy.en, ...trustCopy.en },
};

/** Every valid key, derived from the Arabic source dictionary. */
export type DictKey = keyof typeof dictionaries.ar & string;

export function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Translator factory. Returns the key itself if a translation is missing, and
 * the test suite fails the build if that can happen (tests/i18n.test.ts).
 */
export function createTranslator(locale: Locale) {
  const dict = dictionaries[locale];
  const fallback = dictionaries[DEFAULT_LOCALE];
  return function t(key: DictKey, vars?: Record<string, string | number>): string {
    const template = dict[key] ?? fallback[key] ?? key;
    return interpolate(template, vars);
  };
}

export type Translator = ReturnType<typeof createTranslator>;

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const CURRENCY_LABEL: Record<Locale, string> = { ar: "د.ب", en: "BHD" };

/** Normalise a decimal-string/number to exactly `dp` decimals, no floats. */
export function toFixedString(value: string | number, dp = 3): string {
  const raw = typeof value === "number" ? value.toFixed(dp) : String(value).trim();
  const sign = raw.startsWith("-") ? "-" : "";
  const body = sign ? raw.slice(1) : raw;
  const [intPart = "0", fracPart = ""] = body.split(".");
  const frac = (fracPart + "0".repeat(dp)).slice(0, dp);
  return `${sign}${intPart || "0"}${dp > 0 ? `.${frac}` : ""}`;
}

/** Group the integer part with thousands separators (Latin digits). */
export function groupDigits(intPart: string): string {
  const sign = intPart.startsWith("-") ? "-" : "";
  const digits = sign ? intPart.slice(1) : intPart;
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * BHD with three decimals: `12.500 د.ب` (ar) / `BHD 12.500` (en).
 * Accepts the decimal string straight out of PostgreSQL numeric columns so no
 * precision is lost between the database and the screen.
 */
export function formatMoney(value: string | number | null | undefined, locale: Locale): string {
  if (value === null || value === undefined || value === "") return "—";
  const fixed = toFixedString(value, 3);
  const [intPart, frac] = fixed.split(".");
  const grouped = groupDigits(intPart ?? "0");
  const amount = `${grouped}.${frac}`;
  return locale === "ar" ? `${amount} ${CURRENCY_LABEL.ar}` : `${CURRENCY_LABEL.en} ${amount}`;
}

/** Money without the currency label (tables, inputs, chart axes). */
export function formatAmount(value: string | number | null | undefined, dp = 3): string {
  if (value === null || value === undefined || value === "") return "—";
  const fixed = toFixedString(value, dp);
  const [intPart, frac] = fixed.split(".");
  return dp > 0 ? `${groupDigits(intPart ?? "0")}.${frac}` : groupDigits(intPart ?? "0");
}

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(localeMeta[locale].intlLocale, {
    numberingSystem: "latn",
    ...options,
  }).format(value);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** `20 سبتمبر 2026` / `20 September 2026`. */
export function formatDate(value: Date | string, locale: Locale): string {
  return new Intl.DateTimeFormat(localeMeta[locale].intlLocale, {
    numberingSystem: "latn",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bahrain",
  }).format(toDate(value));
}

/** `04:30 م` / `4:30 PM`. */
export function formatTime(value: Date | string, locale: Locale): string {
  return new Intl.DateTimeFormat(localeMeta[locale].intlLocale, {
    numberingSystem: "latn",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Bahrain",
  }).format(toDate(value));
}

/** `السبت 20 سبتمبر، 4:30 م` / `Sat 20 Sep, 4:30 PM`. */
export function formatDateTime(value: Date | string, locale: Locale): string {
  return new Intl.DateTimeFormat(localeMeta[locale].intlLocale, {
    numberingSystem: "latn",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Bahrain",
  }).format(toDate(value));
}

export function formatDateShort(value: Date | string, locale: Locale): string {
  return new Intl.DateTimeFormat(localeMeta[locale].intlLocale, {
    numberingSystem: "latn",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Bahrain",
  }).format(toDate(value));
}

/** "منذ 3 ساعات" / "3 hours ago" (never more precise than the truth). */
export function formatRelative(value: Date | string, locale: Locale, now: Date = new Date()): string {
  const then = toDate(value);
  const diffMs = then.getTime() - now.getTime();
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000_000],
    ["month", 2_592_000_000],
    ["week", 604_800_000],
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  const rtf = new Intl.RelativeTimeFormat(localeMeta[locale].intlLocale, { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return rtf.format(0, "minute");
}

/**
 * Weekday name (0 = Sunday, the Bahraini week start).
 *
 * Derived from the same Intl data as every other date on the platform rather
 * than a hand-written list, so an Arabic reader sees "الأحد" and the names stay
 * correct if the locale data is ever updated.
 */
export function weekdayName(weekday: number, locale: Locale): string {
  // 2024-01-07 was a Sunday; adding whole days lands on the requested weekday.
  const reference = new Date(Date.UTC(2024, 0, 7 + (weekday % 7)));
  return new Intl.DateTimeFormat(localeMeta[locale].intlLocale, {
    numberingSystem: "latn",
    weekday: "long",
    timeZone: "UTC",
  }).format(reference);
}

/** `1 س 30 د` / `1 h 30 m` - durations are always shown as hours + minutes. */
export function formatDuration(minutes: number, locale: Locale): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hUnit = locale === "ar" ? "س" : "h";
  const mUnit = locale === "ar" ? "د" : "m";
  if (h && m) return `${h} ${hUnit} ${m} ${mUnit}`;
  if (h) return `${h} ${hUnit}`;
  return `${m} ${mUnit}`;
}

/** Bahrain numbers are stored E.164 (`+973XXXXXXXX`) and shown grouped. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+973") && digits.length === 12) {
    return `+973 ${digits.slice(4, 8)} ${digits.slice(8)}`;
  }
  return digits;
}

export function directionOf(locale: Locale): "rtl" | "ltr" {
  return localeDir[locale];
}

export { localeMeta, otherLocale };

/** Build a locale-aware href, preserving the current path. */
export function switchLocalePath(pathname: string, target: Locale): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return `/${target}`;
  if (isLocale(parts[0] ?? "")) {
    parts[0] = target;
    return `/${parts.join("/")}`;
  }
  return `/${target}${pathname.startsWith("/") ? "" : "/"}${pathname}`;
}
