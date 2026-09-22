import { z } from "zod";

import {
  authenticate,
  cookieMaxAge,
  openSession,
  registerUser,
  revokeSession,
  sessionFromCookieHeader,
} from "@/lib/auth/service";
import { apiError, getClientIp, getUserAgent, isSameOrigin, jsonResponse } from "@/lib/security/http";
import { LIMITS, bucketKey, DbRateLimiter } from "@/lib/security/ratelimit";
import { clearSessionCookie, serializeSessionCookie, SESSION_COOKIE } from "@/lib/security/session";
import { loginSchema, registerSchema } from "@/lib/validation/schemas";
import { writeAudit } from "@/lib/security/audit";
import { parseCookieHeader } from "@/lib/security/session";

export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("register"), payload: registerSchema }),
  z.object({
    action: z.literal("login"),
    payload: loginSchema,
    mfaCode: z.string().trim().max(10).optional().nullable(),
  }),
  z.object({ action: z.literal("logout") }),
]);

/**
 * POST /api/auth - register / login / logout in one route.
 *
 * Login and registration are always rate limited (§20), the rate-limit subject
 * is the real client address (see getClientIp), and failures return stable
 * codes only.
 */
export async function POST(request: Request): Promise<Response> {
  const headers = request.headers;
  if (!isSameOrigin(request, headers)) return apiError("forbidden", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("validation", 422);
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return apiError("validation", 422);

  const ip = getClientIp(headers) ?? "unknown";
  const userAgent = getUserAgent(headers);
  const limiter = new DbRateLimiter();

  if (parsed.data.action === "logout") {
    const cookies = parseCookieHeader(headers.get("cookie"));
    const token = cookies[SESSION_COOKIE];
    if (token) await revokeSession(token).catch(() => undefined);
    return jsonResponse({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
  }

  const isRegister = parsed.data.action === "register";
  const scope = isRegister ? "register" : "login";
  const subject = isRegister ? ip : `${ip}:${parsed.data.payload.email}`;

  try {
    // Two budgets for a login: one per (address, email) pair, and one per
    // address alone so rotating the email cannot multiply the allowance.
    if (scope === "login") {
      const perIp = await limiter.hit(bucketKey("loginPerIp", ip), LIMITS.loginPerIp.limit, LIMITS.loginPerIp.windowSeconds);
      if (!perIp.allowed) return apiError("rate_limited", 429);
    }
    const limit = await limiter.hit(bucketKey(scope, subject), LIMITS[scope].limit, LIMITS[scope].windowSeconds);
    if (!limit.allowed) return apiError("rate_limited", 429);
  } catch {
    return apiError("rate_limited", 429);
  }

  try {
    if (isRegister && parsed.data.action === "register") {
      const user = await registerUser(parsed.data.payload);
      const session = await openSession({
        userId: user.id,
        kind: "user",
        mfaVerified: true,
        ip,
        userAgent,
      });
      await writeAudit({
        actorUserId: user.id,
        actorLabel: user.email,
        action: "user.register",
        entity: "users",
        entityId: user.id,
        ip,
        userAgent,
        after: { role: user.primaryRole, locale: user.locale },
      });
      return jsonResponse(
        { ok: true, user: { id: user.id, fullName: user.fullName, locale: user.locale, role: user.primaryRole } },
        201,
        {
          "Set-Cookie": serializeSessionCookie(session.token, {
            maxAge: cookieMaxAge("user"),
            secure: process.env.NODE_ENV === "production",
          }),
        },
      );
    }

    if (parsed.data.action === "login") {
      const result = await authenticate({
        email: parsed.data.payload.email,
        password: parsed.data.payload.password,
        mfaCode: parsed.data.mfaCode ?? parsed.data.payload.mfaCode ?? null,
        ip,
      });
      if (!result.ok || !result.user) {
        await writeAudit({
          actorUserId: null,
          actorLabel: parsed.data.payload.email,
          action: "auth.login_failed",
          entity: "users",
          // AuditEntry requires entityId; a failed sign-in has no entity. The
          // reason belongs in `reason`, which the type provides, not nested in
          // `after`.
          entityId: null,
          reason: result.failure ?? "unknown",
          ip,
          userAgent,
        });
        const status = result.failure === "mfa_required" || result.failure === "mfa_invalid" ? 401 : 401;
        return apiError(result.failure ?? "invalid_credentials", status);
      }

      const kind = result.user.primaryRole === "admin" ? "admin" : "user";
      const session = await openSession({
        userId: result.user.id,
        kind,
        // MFA is verified for admins by construction: authenticate() refuses
        // to return an admin without a valid TOTP code.
        mfaVerified: kind === "admin",
        ip,
        userAgent,
      });
      await writeAudit({
        actorUserId: result.user.id,
        actorLabel: result.user.email,
        action: "auth.login",
        entity: "users",
        entityId: result.user.id,
        ip,
        userAgent,
        after: { role: result.user.primaryRole },
      });
      return jsonResponse(
        { ok: true, user: { id: result.user.id, fullName: result.user.fullName, locale: result.user.locale, role: result.user.primaryRole } },
        200,
        {
          "Set-Cookie": serializeSessionCookie(session.token, {
            maxAge: cookieMaxAge(kind),
            secure: process.env.NODE_ENV === "production",
          }),
        },
      );
    }

    return apiError("validation", 422);
  } catch (err) {
    const code = err instanceof Error && err.name === "AuthError" ? "validation" : "unexpected";
    if (code === "unexpected") {
      console.error("[api/auth] unexpected", { ip, userAgent, error: err instanceof Error ? err.message : "unknown" });
    }
    return apiError(code, code === "unexpected" ? 500 : 422);
  }
}

/** GET /api/auth - the current session, used by client components. */
export async function GET(request: Request): Promise<Response> {
  const session = await sessionFromCookieHeader(request.headers.get("cookie"));
  if (!session) return jsonResponse({ ok: true, user: null });
  return jsonResponse({
    ok: true,
    user: {
      id: session.user.id,
      fullName: session.user.fullName,
      locale: session.user.locale,
      role: session.user.primaryRole,
      isAdmin: session.kind === "admin",
      tutorId: session.user.tutorId,
    },
  });
}
