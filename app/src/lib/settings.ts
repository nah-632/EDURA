/**
 * Platform settings (§41).
 *
 * Business settings are data, not code: they live in the `settings` table and
 * are editable by admins. Environment variables only provide the initial
 * defaults so a fresh deployment is usable, and every read falls back to those
 * defaults if the database is unreachable or the row is missing.
 */
import { query, queryOne, dbConfigured } from "@/lib/db";
import type { GuaranteeConfig } from "@/lib/guarantee/rules";

export interface PlatformSettings {
  platformNameAr: string;
  platformNameEn: string;
  whatsappNumber: string | null;
  benefitPayNumber: string;
  supportEmail: string;
  supportPhone: string;
  currency: "BHD";
  cancellationHours: number;
  minLeadTimeHours: number;
  maxAdvanceDays: number;
  reviewModeration: boolean;
  allowTutorDecline: boolean;
  /**
   * Guarantee terms (addendum §C). Commercial policy, so admin-editable:
   * the guarantee page, the homepage badge and the claim decision all read
   * these same numbers, which is why they cannot drift apart.
   */
  guaranteeEnabled: boolean;
  guaranteeClaimWindowHours: number;
  guaranteeMaxCompletedSessions: number;
  guaranteeReplacementSessions: number;
  /**
   * Platform commission on a lesson fee, as a percentage.
   *
   * Commercial policy, so it is data rather than a constant: §29 requires the
   * architecture to carry a commission without rebuilding booking/payment, and
   * the public copy on the pricing page and in the tutor terms reads this same
   * number — which is why saying "no commission" in one place while charging
   * 20% in another is not possible.
   */
  commissionPercent: number;
  /** Launch offer: the first N tutors are not charged a subscription. */
  launchOfferEnabled: boolean;
  launchOfferTutorLimit: number;
  /**
   * Slice A+K: strict guardian-link enforcement. DATA, not config — read by
   * the booking engine AND by the 0004 SQL trigger from this same settings
   * row, so the two layers cannot disagree. Off = grace period.
   */
  guardianEnforcementStrict: boolean;
}

export const SETTINGS_KEY = "platform";

export function defaultSettings(): PlatformSettings {
  return {
    platformNameAr: "إدورا",
    platformNameEn: "Edura",
    whatsappNumber: process.env.WHATSAPP_TARGET ?? null,
    benefitPayNumber: process.env.BENEFITPAY_NUMBER ?? "+97366661238",
    supportEmail: process.env.SUPPORT_EMAIL ?? "support@edura.world",
    supportPhone: process.env.SUPPORT_PHONE ?? process.env.WHATSAPP_TARGET ?? "",
    currency: "BHD",
    cancellationHours: 24,
    minLeadTimeHours: 12,
    maxAdvanceDays: 60,
    reviewModeration: true,
    allowTutorDecline: true,
    guaranteeEnabled: true,
    guaranteeClaimWindowHours: 48,
    guaranteeMaxCompletedSessions: 1,
    guaranteeReplacementSessions: 1,
    commissionPercent: 20,
    launchOfferEnabled: true,
    launchOfferTutorLimit: 15,
    guardianEnforcementStrict: false,
  };
}

let cache: { at: number; value: PlatformSettings } | null = null;
const TTL_MS = 60_000;

export async function getSettings(): Promise<PlatformSettings> {
  const defaults = defaultSettings();
  if (!dbConfigured()) return defaults;
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const row = await queryOne<{ value: Partial<PlatformSettings> }>(
      "select value from settings where key = $1",
      [SETTINGS_KEY],
    );
    const merged: PlatformSettings = { ...defaults, ...(row?.value ?? {}), currency: "BHD" };
    cache = { at: Date.now(), value: merged };
    return merged;
  } catch {
    // Never let settings availability break a page render.
    return defaults;
  }
}

export async function saveSettings(
  patch: Partial<PlatformSettings>,
  adminUserId: string | null,
): Promise<PlatformSettings> {
  const current = await getSettings();
  const next: PlatformSettings = { ...current, ...patch, currency: "BHD" };
  await query(
    `insert into settings (key, value, updated_by, updated_at)
     values ($1, $2, $3, now())
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [SETTINGS_KEY, JSON.stringify(next), adminUserId],
  );
  cache = { at: Date.now(), value: next };
  return next;
}

export function invalidateSettingsCache(): void {
  cache = null;
}

/** Booking rules derived from the same settings row. */
export interface BookingSettings {
  minLeadTimeHours: number;
  maxAdvanceDays: number;
  cancellationHours: number;
  allowTutorDecline: boolean;
  guardianEnforcementStrict: boolean;
}

export async function getBookingSettings(): Promise<BookingSettings> {
  const s = await getSettings();
  return {
    minLeadTimeHours: s.minLeadTimeHours,
    maxAdvanceDays: s.maxAdvanceDays,
    cancellationHours: s.cancellationHours,
    allowTutorDecline: s.allowTutorDecline,
    guardianEnforcementStrict: s.guardianEnforcementStrict,
  };
}

/** Guarantee terms as the rules module consumes them (addendum §C). */
export async function getGuaranteeConfig(): Promise<GuaranteeConfig> {
  const s = await getSettings();
  return {
    satisfactionEnabled: s.guaranteeEnabled,
    claimWindowHours: s.guaranteeClaimWindowHours,
    maxCompletedSessions: s.guaranteeMaxCompletedSessions,
    replacementSessions: s.guaranteeReplacementSessions,
  };
}
