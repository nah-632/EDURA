/**
 * API error code → dictionary key.
 *
 * The API answers with stable codes (`slot_taken`, `invalid_transition`, …) and
 * never with prose, so the translation lives here in one place. Any code the
 * client does not recognise falls back to a generic message rather than showing
 * a raw machine string to a customer.
 */
import type { DictKey } from "@/lib/i18n";

const MAP: Record<string, DictKey> = {
  unauthorized: "state.unauthorized",
  session_expired: "error.sessionExpired",
  forbidden: "state.forbidden",
  admin_required: "state.unauthorized",
  not_found: "error.notFound",
  validation: "error.validation",
  rate_limited: "error.rateLimited",
  slot_taken: "error.slotTaken",
  duplicate: "error.duplicate",
  invalid_transition: "error.invalidTransition",
  invalid_state: "error.invalidState",
  reason_required: "error.reasonRequired",
  not_configured: "error.notConfigured",
  network: "error.network",
  unexpected: "error.unexpected",
};

export function errorKeyFor(code: string | undefined | null): DictKey {
  if (!code) return "error.unexpected";
  return MAP[code] ?? "error.unexpected";
}
