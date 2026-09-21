/**
 * Server sessions.
 *
 * The cookie carries a random 256-bit token; the database stores only its
 * SHA-256, so a leaked database row cannot be replayed as a live session.
 * Sessions are DB-backed (not stateless JWTs) because "sign out everywhere"
 * and instant revocation after a role or status change must actually work.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "edura_session";
export const USER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours

export interface SessionToken {
  /** value that goes into the cookie */
  token: string;
  /** value stored in sessions.token_hash */
  hash: string;
}

export function createSessionToken(): SessionToken {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface CookieOptions {
  maxAge: number;
  secure?: boolean;
}

export function serializeSessionCookie(token: string, options: CookieOptions): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(options.maxAge))}`,
  ];
  // Secure is required in production; omitted on http://localhost so local
  // development and the static preview harness can still sign in.
  if (options.secure !== false) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}

export function parseCookieHeader(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function sessionExpiry(kind: "user" | "admin", now: Date = new Date()): Date {
  const seconds = kind === "admin" ? ADMIN_SESSION_TTL_SECONDS : USER_SESSION_TTL_SECONDS;
  return new Date(now.getTime() + seconds * 1000);
}

/**
 * Progressive login throttling driven by the account record: after 5 failures
 * the account is locked for a period that doubles, capped at 15 minutes.
 */
export function lockoutFor(failedLogins: number): { lockedUntil: Date | null; nextCount: number } {
  const nextCount = failedLogins + 1;
  if (nextCount < 5) return { lockedUntil: null, nextCount };
  const minutes = Math.min(15, 2 ** (nextCount - 5));
  return { lockedUntil: new Date(Date.now() + minutes * 60_000), nextCount };
}

export function isLocked(lockedUntil: Date | null | undefined, now: Date = new Date()): boolean {
  return Boolean(lockedUntil && lockedUntil.getTime() > now.getTime());
}
