/**
 * Public CMS content (§15, addendum §A/§B/§C).
 *
 * The homepage hero, the About page, the Guarantee page and the legal intros
 * are operator-editable text stored under a single `settings` key. The
 * dictionary remains the source of the default wording, so a fresh deployment
 * (or an unreachable database) still renders complete, reviewed copy instead of
 * empty paragraphs.
 *
 * The read is tolerant by design: a marketing page must never 500 because the
 * CMS row is missing, and a half-filled CMS row must fall back FIELD BY FIELD,
 * not wholesale.
 */
import { dbConfigured, queryOne } from "@/lib/db";
import type { Locale } from "@/lib/i18n";

export const CMS_KEY = "cms";

export interface CmsContent {
  // Hero (homepage)
  heroTitleAr?: string | null;
  heroTitleEn?: string | null;
  heroLeadAr?: string | null;
  heroLeadEn?: string | null;
  promoBannerAr?: string | null;
  promoBannerEn?: string | null;
  promoActive?: boolean;
  // About ( addendum §A )
  aboutIntroAr?: string | null;
  aboutIntroEn?: string | null;
  aboutFamiliesAr?: string | null;
  aboutFamiliesEn?: string | null;
  aboutTutorsAr?: string | null;
  aboutTutorsEn?: string | null;
  aboutClosingAr?: string | null;
  aboutClosingEn?: string | null;
  // Guarantee ( addendum §C )
  guaranteeIntroAr?: string | null;
  guaranteeIntroEn?: string | null;
  guaranteeSatisfactionAr?: string | null;
  guaranteeSatisfactionEn?: string | null;
  guaranteeNotCoveredAr?: string | null;
  guaranteeNotCoveredEn?: string | null;
  // Legal
  faqAr?: string | null;
  faqEn?: string | null;
  termsAr?: string | null;
  termsEn?: string | null;
  privacyAr?: string | null;
  privacyEn?: string | null;
}

let cache: { at: number; value: CmsContent } | null = null;
const TTL_MS = 60_000;

export async function readCmsContent(): Promise<CmsContent> {
  if (!dbConfigured()) return {};
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const row = await queryOne<{ value: CmsContent }>(`select value from settings where key = $1`, [CMS_KEY]);
    const value = row?.value && typeof row.value === "object" ? row.value : {};
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return {};
  }
}

/** Drop the memo when an admin saves, so the next render shows the new text. */
export function invalidateCmsCache(): void {
  cache = null;
}

/**
 * Pick a CMS value for the active locale, falling back to the dictionary
 * default. `base` is the field name without the Ar/En suffix.
 */
export function cmsText(
  cms: CmsContent,
  base: keyof CmsContent extends infer _K ? string : string,
  locale: Locale,
  fallback: string,
): string {
  const primary = (cms as Record<string, unknown>)[`${base}${locale === "ar" ? "Ar" : "En"}`];
  const secondary = (cms as Record<string, unknown>)[`${base}${locale === "ar" ? "En" : "Ar"}`];
  const chosen = typeof primary === "string" && primary.trim() ? primary.trim() : null;
  if (chosen) return chosen;
  const alt = typeof secondary === "string" && secondary.trim() ? secondary.trim() : null;
  return alt ?? fallback;
}

/** Render `{hours}`/`{sessions}` style placeholders in the guarantee copy. */
export function fillPlaceholders(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}
