import { timingSafeEqual } from "node:crypto";

import { runReminderJob, runSubscriptionExpiryJob } from "@/lib/reminders/service";
import { apiError, jsonResponse } from "@/lib/security/http";

export const dynamic = "force-dynamic";

/**
 * GET|POST /api/cron/reminders  (§18)
 *
 * The scheduled workload for the platform: lesson reminders (24h and 2h), the
 * post-lesson review request, and subscription expiry warnings.
 *
 * Protected by a shared secret because it is the one endpoint on the platform
 * that acts for everyone. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`;
 * any other scheduler can send `x-cron-secret`.
 *
 * When CRON_SECRET is not configured the route answers 501 and does NOTHING.
 * An unauthenticated job endpoint that quietly succeeds would be both a security
 * hole and a lie, so it refuses instead.
 */
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const header = request.headers.get("x-cron-secret")?.trim();
  const provided = bearer || header || "";
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(request: Request): Promise<Response> {
  if (!process.env.CRON_SECRET?.trim()) return apiError("not_configured", 501);
  if (!authorised(request)) return apiError("forbidden", 403);

  try {
    const reminders = await runReminderJob();
    const subscriptions = await runSubscriptionExpiryJob();
    return jsonResponse({ ok: true, reminders, subscriptions });
  } catch (err) {
    // A failed job must be loud in the logs: it is the only thing standing
    // between a customer and a missed lesson.
    console.error("[cron/reminders] failed", err instanceof Error ? err.message : "unknown");
    return apiError("unexpected", 500);
  }
}

export async function GET(request: Request): Promise<Response> {
  return run(request);
}

export async function POST(request: Request): Promise<Response> {
  return run(request);
}
