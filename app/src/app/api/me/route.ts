import { z } from "zod";

import { changeOwnPassword, deleteOwnAccount, getAccountProfile, revokeMyOtherSessions, updateOwnProfile } from "@/lib/account/service";
import { requireUser } from "@/lib/auth/service";
import { apiError, getClientIp, jsonResponse, isSameOrigin } from "@/lib/security/http";
import { LIMITS, bucketKey, DbRateLimiter } from "@/lib/security/ratelimit";
import { clearSessionCookie } from "@/lib/security/session";
import { localeSchema, password, shortText } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * GET  /api/me          - the signed-in account
 * POST /api/me          - profile, preferences, password, sessions, deletion
 *
 * The user id always comes from the session, so this route has no id parameter
 * to tamper with. Deletion is rate limited like a credential change: it is an
 * irreversible action on a shared-device browser.
 */
const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update_profile"),
    fullName: shortText(3, 120).optional(),
    displayName: z.string().trim().max(80).nullable().optional(),
    locale: localeSchema.optional(),
    notificationPrefs: z.record(z.boolean()).optional(),
  }),
  z.object({
    action: z.literal("change_password"),
    currentPassword: z.string().min(1).max(200),
    newPassword: password,
  }),
  z.object({ action: z.literal("revoke_other_sessions") }),
  z.object({
    action: z.literal("delete_account"),
    confirm: z.literal("delete"),
    // Re-authentication: irreversible actions are not authorised by a session
    // alone (§25).
    password: z.string().min(1).max(200),
  }),
]);

export async function GET(request: Request): Promise<Response> {
  let session;
  try {
    session = await requireUser(request);
  } catch {
    return apiError("unauthorized", 401);
  }
  const profile = await getAccountProfile(session.user.id);
  if (!profile) return apiError("not_found", 404);
  return jsonResponse({ ok: true, profile });
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request, request.headers)) return apiError("forbidden", 403);

  let session;
  try {
    session = await requireUser(request);
  } catch {
    return apiError("unauthorized", 401);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("validation", 422);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return apiError("validation", 422);

  const ip = getClientIp(request.headers) ?? "unknown";
  const limiter = new DbRateLimiter();
  try {
    const limit = await limiter.hit(bucketKey("passwordReset", `${session.user.id}:${parsed.data.action}`), LIMITS.passwordReset.limit, LIMITS.passwordReset.windowSeconds);
    if (!limit.allowed) return apiError("rate_limited", 429);
  } catch {
    return apiError("rate_limited", 429);
  }

  try {
    if (parsed.data.action === "update_profile") {
      const profile = await updateOwnProfile(session.user.id, {
        fullName: parsed.data.fullName,
        displayName: parsed.data.displayName,
        locale: parsed.data.locale,
        notificationPrefs: parsed.data.notificationPrefs,
      });
      return jsonResponse({ ok: true, profile });
    }

    if (parsed.data.action === "change_password") {
      const result = await changeOwnPassword(
        session.user.id,
        session.sessionId,
        parsed.data.currentPassword,
        parsed.data.newPassword,
      );
      if (result === "wrong_password") return apiError("invalid_credentials", 401);
      if (result === "policy") return apiError("validation", 422, "password");
      return jsonResponse({ ok: true });
    }

    if (parsed.data.action === "revoke_other_sessions") {
      const revoked = await revokeMyOtherSessions(session.user.id, session.sessionId);
      return jsonResponse({ ok: true, revoked });
    }

    const outcome = await deleteOwnAccount(session.user.id, parsed.data.password);
    return jsonResponse({ ok: true, ...outcome }, 200, { "Set-Cookie": clearSessionCookie() });
  } catch (err) {
    if (err instanceof Error && err.message === "wrong_password") {
      return apiError("invalid_credentials", 401);
    }
    console.error("[api/me] failed", { ip, error: err instanceof Error ? err.message : "unknown" });
    return apiError("unexpected", 500);
  }
}
