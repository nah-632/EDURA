/**
 * Admin authorization (§15, §20).
 *
 * Two entry points, one rule: an admin surface is reachable only by a session
 * whose `kind` is `admin` AND whose second factor was verified at sign-in. A
 * regular user session - even for an account whose role is admin - is not
 * enough, and the permission set is resolved from the RBAC tables on every
 * request, never trusted from a cookie.
 *
 * Pages and routes both go through here so authorization cannot be remembered
 * in one place and forgotten in another.
 */
import { headers as requestHeaders } from "next/headers";

import { loadSession, type SessionContext } from "@/lib/auth/service";
import { getClientIp, getUserAgent, isSameOrigin, apiError } from "@/lib/security/http";
import { hasPermission, type Permission } from "@/lib/security/rbac";
import { SESSION_COOKIE, parseCookieHeader } from "@/lib/security/session";

export interface AdminContext {
  session: SessionContext;
  actorUserId: string;
  actorLabel: string;
  ip: string | null;
  userAgent: string | null;
}

function contextFrom(session: SessionContext, headers: Headers): AdminContext {
  return {
    session,
    actorUserId: session.user.id,
    actorLabel: session.user.email,
    ip: getClientIp(headers),
    userAgent: getUserAgent(headers),
  };
}

/** Resolve an admin context from raw headers (used by routes and by pages). */
export async function adminContextFromHeaders(headers: Headers): Promise<AdminContext | null> {
  const token = parseCookieHeader(headers.get("cookie"))[SESSION_COOKIE] ?? null;
  let session: SessionContext | null = null;
  try {
    session = await loadSession(token);
  } catch {
    // A database outage must not turn into "you are signed in"; deny.
    return null;
  }
  if (!session) return null;
  if (session.kind !== "admin" || !session.mfaVerified) return null;
  return contextFrom(session, headers);
}

/** Server-component guard. */
export async function adminContext(): Promise<AdminContext | null> {
  const headers = await requestHeaders();
  return adminContextFromHeaders(headers);
}

export type AdminGate =
  | { ok: true; ctx: AdminContext }
  | { ok: false; reason: "unauthenticated" | "forbidden" };

/** Page guard: unauthenticated pages redirect, under-permissioned pages explain. */
export async function adminGate(permission: Permission): Promise<AdminGate> {
  const ctx = await adminContext();
  if (!ctx) return { ok: false, reason: "unauthenticated" };
  if (!hasPermission(ctx.session.permissions, permission)) return { ok: false, reason: "forbidden" };
  return { ok: true, ctx };
}

export type AdminApiGate =
  | { ok: true; ctx: AdminContext }
  | { ok: false; response: Response };

/**
 * API guard. Returns a ready-made response so a route cannot proceed by
 * accident after a failed check, and the origin check is part of the guard for
 * every mutating admin call (CSRF, §20).
 */
export async function requireAdminApi(request: Request, permission: Permission): Promise<AdminApiGate> {
  const headers = request.headers;
  if (!isSameOrigin(request, headers)) return { ok: false, response: apiError("forbidden", 403) };
  const ctx = await adminContextFromHeaders(headers);
  if (!ctx) return { ok: false, response: apiError("admin_required", 403) };
  if (!hasPermission(ctx.session.permissions, permission)) return { ok: false, response: apiError("forbidden", 403) };
  return { ok: true, ctx };
}

export function can(ctx: AdminContext, permission: Permission): boolean {
  return hasPermission(ctx.session.permissions, permission);
}
