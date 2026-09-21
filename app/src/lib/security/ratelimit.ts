/**
 * Rate limiting.
 *
 * Fixed windows in the database, not in process memory: on a serverless host
 * each instance has its own memory, so an in-process counter would quietly
 * multiply every limit by the number of warm instances.
 *
 * §20 requires explicit limits on authentication and booking creation; the
 * limits themselves live in `LIMITS` so they are reviewable in one place.
 */
import { query } from "@/lib/db";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
}

export interface RateLimiter {
  hit(bucket: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

export const LIMITS = {
  login: { limit: 10, windowSeconds: 300 },
  /**
   * Second login budget keyed by address ALONE. Without it, an attacker who
   * rotates the email address gets a fresh 10 attempts per address and can
   * credential-stuff indefinitely from one machine.
   */
  loginPerIp: { limit: 40, windowSeconds: 300 },
  register: { limit: 5, windowSeconds: 3600 },
  bookingCreate: { limit: 12, windowSeconds: 3600 },
  upload: { limit: 20, windowSeconds: 3600 },
  review: { limit: 10, windowSeconds: 86400 },
  contactMessage: { limit: 5, windowSeconds: 3600 },
  passwordReset: { limit: 5, windowSeconds: 3600 },
} as const;

function windowStart(now: Date, windowSeconds: number): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

/** Production limiter (SQL, safe across instances). */
export class DbRateLimiter implements RateLimiter {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async hit(bucket: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const start = windowStart(this.now(), windowSeconds);
    const rows = await query<{ hits: number }>(
      `insert into rate_limits (bucket, window_start, hits)
       values ($1, $2, 1)
       on conflict (bucket, window_start) do update set hits = rate_limits.hits + 1
       returning hits`,
      [bucket, start.toISOString()],
    );
    const hits = rows[0]?.hits ?? 1;
    return {
      allowed: hits <= limit,
      remaining: Math.max(0, limit - hits),
      limit,
      resetAt: new Date(start.getTime() + windowSeconds * 1000),
    };
  }
}

/** In-memory limiter: tests and local development only. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, { windowStart: number; hits: number }>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async hit(bucket: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const start = windowStart(this.now(), windowSeconds).getTime();
    const current = this.buckets.get(bucket);
    const hits = current && current.windowStart === start ? current.hits + 1 : 1;
    this.buckets.set(bucket, { windowStart: start, hits });
    return {
      allowed: hits <= limit,
      remaining: Math.max(0, limit - hits),
      limit,
      resetAt: new Date(start + windowSeconds * 1000),
    };
  }
}

export type RateLimitScope = keyof typeof LIMITS;

/**
 * Compose the bucket key from a scope and a subject (IP address, user id or
 * email). Emails are lower-cased so casing cannot be used to evade a limit.
 */
export function bucketKey(scope: RateLimitScope, subject: string): string {
  const normalised = subject.trim().toLowerCase().slice(0, 120);
  return `${scope}:${normalised}`;
}
