/** Locale plumbing shared by the dictionaries and the formatters. */
export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];
export const DEFAULT_LOCALE: Locale = "ar";

export const localeDir: Record<Locale, "rtl" | "ltr"> = { ar: "rtl", en: "ltr" };

/** Arabic is the primary market language; English is a first-class second. */
export const localeMeta: Record<Locale, { label: string; short: string; htmlLang: string; intlLocale: string }> = {
  ar: { label: "العربية", short: "AR", htmlLang: "ar-BH", intlLocale: "ar-BH" },
  en: { label: "English", short: "EN", htmlLang: "en-BH", intlLocale: "en-BH" },
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function otherLocale(locale: Locale): Locale {
  return locale === "ar" ? "en" : "ar";
}

/** Nested-free dictionary shape: flat dotted keys, one value per locale. */
export type Dictionary = Record<string, string>;

/**
 * Interpolate `{placeholders}`. Missing values are surfaced loudly in
 * development rather than rendering a literal `{name}` to a customer.
 */
export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? `{${key}}` : String(value);
  });
}
