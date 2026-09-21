/**
 * Authentication service.
 *
 * Responsibilities: register, authenticate (with lockout + optional TOTP for
 * admins), open/close DB-backed sessions, and resolve what the current request
 * is allowed to do. Route handlers never look at a cookie or a role directly -
 * they call `currentUser()` / `requirePermission()` here, so authorization
 * cannot be forgotten in one place and remembered in another.
 */
import { query, queryOne, withTransaction, type TxClient } from "@/lib/db";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "@/lib/security/password";
import {
  ADMIN_SESSION_TTL_SECONDS,
  SESSION_COOKIE,
  USER_SESSION_TTL_SECONDS,
  createSessionToken,
  hashSessionToken,
  isLocked,
  lockoutFor,
  parseCookieHeader,
  sessionExpiry,
} from "@/lib/security/session";
import { permissionsFor, type Permission } from "@/lib/security/rbac";
import { verifyTotp } from "@/lib/security/totp";
import type { Locale } from "@/lib/i18n";

export interface AuthUser {
  id: string;
  email: string;
  phone: string;
  primaryRole: "student" | "parent" | "tutor" | "admin";
  status: "active" | "restricted" | "suspended" | "deleted";
  locale: Locale;
  fullName: string;
  mfaEnabled: boolean;
  tutorId: string | null;
}

export interface SessionContext {
  user: AuthUser;
  sessionId: string;
  kind: "user" | "admin";
  mfaVerified: boolean;
  permissions: Set<Permission>;
  expiresAt: Date;
}

export type AuthFailure =
  | "invalid_credentials"
  | "account_suspended"
  | "account_locked"
  | "mfa_required"
  | "mfa_invalid"
  | "not_configured";

export interface AuthResult {
  ok: boolean;
  failure?: AuthFailure;
  user?: AuthUser;
}

export class AuthError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ?? code);
    this.name = "AuthError";
  }
}

const USER_COLUMNS = `
  u.id, u.email, u.phone, u.primary_role as "primaryRole", u.status, u.locale,
  u.mfa_secret as "mfaSecret", u.mfa_enabled as "mfaEnabled", u.failed_logins as "failedLogins",
  u.locked_until as "lockedUntil",
  coalesce(p.full_name, u.email) as "fullName",
  (select t.id from tutors t where t.user_id = u.id) as "tutorId"
`;

interface UserRow {
  id: string;
  email: string;
  phone: string;
  primaryRole: AuthUser["primaryRole"];
  status: AuthUser["status"];
  locale: string;
  mfaSecret: string | null;
  mfaEnabled: boolean;
  failedLogins: number;
  lockedUntil: Date | null;
  fullName: string;
  tutorId: string | null;
  passwordHash?: string;
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    primaryRole: row.primaryRole,
    status: row.status,
    locale: (row.locale === "en" ? "en" : "ar") as Locale,
    fullName: row.fullName,
    mfaEnabled: row.mfaEnabled,
    tutorId: row.tutorId,
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
export interface RegisterParams {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  accountType: "student" | "tutor";
  locale: Locale;
}

export async function registerUser(params: RegisterParams): Promise<AuthUser> {
  const policy = checkPasswordPolicy(params.password);
  if (!policy.ok) throw new AuthError("password_policy", policy.reasons.join(","));
  const passwordHash = await hashPassword(params.password);

  return withTransaction(async (tx: TxClient) => {
    const rows = await tx.query<UserRow>(
      `insert into users (email, phone, password_hash, primary_role, locale)
       values ($1, $2, $3, $4, $5)
       returning id, email, phone, primary_role as "primaryRole", status, locale,
                 mfa_secret as "mfaSecret", mfa_enabled as "mfaEnabled",
                 failed_logins as "failedLogins", locked_until as "lockedUntil"`,
      [params.email, params.phone, passwordHash, params.accountType, params.locale],
    );
    const row = rows[0]!;
    await tx.query(
      `insert into user_profiles (user_id, full_name, preferred_locale)
       values ($1, $2, $3)`,
      [row.id, params.fullName, params.locale],
    );
    // primary_role is the shortcut; the RBAC tables are the authority.
    await tx.query(
      `insert into user_roles (user_id, role_id)
       select $1, id from roles where code = $2
       on conflict do nothing`,
      [row.id, params.accountType === "tutor" ? "tutor" : "student"],
    );
    if (params.accountType === "tutor") {
      await tx.query(
        `insert into tutors (user_id, status, price_per_hour, submitted_at)
         values ($1, 'pending', 5.000, null)
         on conflict (user_id) do nothing`,
        [row.id],
      );
    }
    return toAuthUser({ ...row, fullName: params.fullName, tutorId: null });
  });
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------
export interface SignInParams {
  email: string;
  password: string;
  mfaCode?: string | null;
  ip?: string | null;
  allowAdmin?: boolean;
}

export async function authenticate(params: SignInParams): Promise<AuthResult> {
  const row = await queryOne<UserRow & { passwordHash: string }>(
    `select ${USER_COLUMNS}, u.password_hash as "passwordHash"
       from users u left join user_profiles p on p.user_id = u.id
      where u.email_normalized = lower($1) and u.deleted_at is null`,
    [params.email],
  );
  // Always run a comparison to keep the timing of "unknown email" and "wrong
  // password" indistinguishable.
  const stored = row?.passwordHash ?? "$scrypt$0$0$0$AA==$AA==";
  const passwordOk = await verifyPassword(params.password, stored).catch(() => false);

  if (!row) return { ok: false, failure: "invalid_credentials" };
  if (isLocked(row.lockedUntil)) return { ok: false, failure: "account_locked" };
  if (!passwordOk) {
    const { lockedUntil, nextCount } = lockoutFor(row.failedLogins);
    await query("update users set failed_logins = $2, locked_until = $3 where id = $1", [
      row.id,
      nextCount,
      lockedUntil,
    ]);
    return { ok: false, failure: "invalid_credentials" };
  }
  if (row.status === "suspended" || row.status === "deleted") {
    return { ok: false, failure: "account_suspended" };
  }

  // Admin accounts always require a second factor (§15).
  const requiresMfa = row.primaryRole === "admin" || row.mfaEnabled;
  if (requiresMfa) {
    if (!params.mfaCode) return { ok: false, failure: "mfa_required" };
    if (!row.mfaSecret) return { ok: false, failure: "mfa_invalid" };
    if (!verifyTotp(row.mfaSecret, params.mfaCode)) return { ok: false, failure: "mfa_invalid" };
  }

  await query("update users set failed_logins = 0, locked_until = null, last_login_at = now() where id = $1", [
    row.id,
  ]);
  return { ok: true, user: toAuthUser(row) };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
export interface OpenedSession {
  token: string;
  expiresAt: Date;
  sessionId: string;
}

export async function openSession(params: {
  userId: string;
  kind: "user" | "admin";
  mfaVerified: boolean;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<OpenedSession> {
  const { token, hash } = createSessionToken();
  const expiresAt = sessionExpiry(params.kind);
  const rows = await query<{ id: string }>(
    `insert into sessions (user_id, token_hash, kind, mfa_verified, ip, user_agent, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [params.userId, hash, params.kind, params.mfaVerified, params.ip ?? null, params.userAgent ?? null, expiresAt],
  );
  return { token, expiresAt, sessionId: rows[0]!.id };
}

export async function loadSession(token: string | null | undefined): Promise<SessionContext | null> {
  if (!token) return null;
  const hash = hashSessionToken(token);
  const row = await queryOne<UserRow & { sessionId: string; kind: "user" | "admin"; mfaVerified: boolean; expiresAt: Date }>(
    `select ${USER_COLUMNS},
            s.id as "sessionId", s.kind, s.mfa_verified as "mfaVerified", s.expires_at as "expiresAt"
       from sessions s
       join users u on u.id = s.user_id
       left join user_profiles p on p.user_id = u.id
      where s.token_hash = $1
        and s.revoked_at is null
        and s.expires_at > now()
        and u.deleted_at is null`,
    [hash],
  );
  if (!row) return null;
  if (row.status === "suspended" || row.status === "deleted") return null;

  const roles = await query<{ code: string }>(
    `select r.code from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = $1`,
    [row.id],
  );
  const roleCodes = roles.map((r) => r.code);
  // Bootstrap accommodation, deliberately narrow: an admin with NO role rows at
  // all (the first administrator, created before anyone could grant a role) is
  // treated as a super admin. The moment any role row exists it is the
  // authority - implying super_admin whenever the rows merely lack "admin"
  // would let a mis-assigned primary_role escalate past the RBAC model.
  if (row.primaryRole === "admin" && roleCodes.length === 0) {
    roleCodes.push("super_admin");
  }

  return {
    user: toAuthUser(row),
    sessionId: row.sessionId,
    kind: row.kind,
    mfaVerified: row.mfaVerified,
    permissions: permissionsFor(roleCodes),
    expiresAt: row.expiresAt,
  };
}

export async function touchSession(sessionId: string): Promise<void> {
  await query("update sessions set last_seen_at = now() where id = $1", [sessionId]);
}

export async function revokeSession(token: string): Promise<void> {
  await query("update sessions set revoked_at = now() where token_hash = $1 and revoked_at is null", [
    hashSessionToken(token),
  ]);
}

export async function revokeOtherSessions(userId: string, keepSessionId: string): Promise<number> {
  const rows = await query(
    `update sessions set revoked_at = now()
      where user_id = $1 and id <> $2 and revoked_at is null
      returning id`,
    [userId, keepSessionId],
  );
  return rows.length;
}

/**
 * Server components read the cookie through next/headers, not through a
 * Request object. One helper keeps the cookie name in a single place.
 */
export async function sessionFromCookieHeader(cookieHeader: string | null): Promise<SessionContext | null> {
  const cookies = parseCookieHeader(cookieHeader);
  return loadSession(cookies[SESSION_COOKIE] ?? null);
}

export function sessionCookieValue(request: Request): string | null {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  return cookies[SESSION_COOKIE] ?? null;
}

export function cookieMaxAge(kind: "user" | "admin"): number {
  return kind === "admin" ? ADMIN_SESSION_TTL_SECONDS : USER_SESSION_TTL_SECONDS;
}

// ---------------------------------------------------------------------------
// Request helpers used by routes and pages
// ---------------------------------------------------------------------------
export async function currentUser(request: Request): Promise<SessionContext | null> {
  return loadSession(sessionCookieValue(request));
}

export async function requireUser(request: Request): Promise<SessionContext> {
  const session = await currentUser(request);
  if (!session) throw new AuthError("unauthorized");
  return session;
}

export async function requirePermission(request: Request, permission: Permission): Promise<SessionContext> {
  const session = await currentUser(request);
  if (!session) throw new AuthError("unauthorized");
  if (session.kind !== "admin" || !session.mfaVerified) throw new AuthError("admin_mfa_required");
  if (!session.permissions.has(permission)) throw new AuthError("forbidden");
  return session;
}

/** Tutor-side guard: the signed-in user must own the tutor profile. */
export async function requireTutor(request: Request): Promise<{ session: SessionContext; tutorId: string }> {
  const session = await requireUser(request);
  if (!session.user.tutorId) throw new AuthError("not_a_tutor");
  return { session, tutorId: session.user.tutorId };
}
