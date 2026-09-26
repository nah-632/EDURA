import { dbConfigured, queryOne } from "@/lib/db";
import { jsonResponse } from "@/lib/security/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — deployment self-check.
 *
 * Answers the one question that is otherwise invisible from outside the
 * platform: *which* configuration is missing on this deployment. The operator
 * added the environment variables, redeployed, and the site still served
 * fixture data — and from the outside there was no way to tell whether the
 * variable was absent, misspelled, scoped to Preview only, or whether the
 * database was reachable but empty.
 *
 * Reports NAMES and booleans only. No value of any variable is ever returned,
 * not even a prefix, so this is safe to leave in place and safe to share.
 *
 * The database check is a real round trip, not a flag read: a variable that is
 * present but points at an unreachable host is a different problem from one
 * that is absent, and they need different fixes.
 */
const REQUIRED = [
  "DATABASE_URL",
  "DATABASE_URL_DIRECT",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "WHATSAPP_TARGET",
  "BENEFITPAY_NUMBER",
  "SUPPORT_EMAIL",
] as const;

export async function GET(): Promise<Response> {
  const present: Record<string, boolean> = {};
  const missing: string[] = [];
  for (const key of REQUIRED) {
    const set = Boolean(process.env[key]?.trim());
    present[key] = set;
    if (!set) missing.push(key);
  }

  let database: "not-configured" | "unreachable" | "connected" = "not-configured";
  let tables: number | null = null;
  let tutors: number | null = null;
  let subjects: number | null = null;
  let databaseError: string | null = null;

  if (dbConfigured()) {
    try {
      const counts = await queryOne<{ tables: number; subjects: number; tutors: number }>(
        `select
           (select count(*)::int from information_schema.tables
             where table_schema = 'public' and table_type = 'BASE TABLE') as tables,
           (select count(*)::int from subjects) as subjects,
           (select count(*)::int from tutors) as tutors`,
      );
      database = "connected";
      tables = counts?.tables ?? null;
      subjects = counts?.subjects ?? null;
      tutors = counts?.tutors ?? null;
    } catch (err) {
      database = "unreachable";
      // The driver message names the host or the SQLSTATE — useful to the
      // operator, and it contains no credential.
      databaseError = err instanceof Error ? err.message : String(err);
    }
  }

  const healthy = missing.length === 0 && database === "connected";

  return jsonResponse(
    {
      ok: healthy,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 9) ?? null,
      // NEXT_PUBLIC_* is INLINED at build time, so a value here proves it was
      // set on the build that produced this deployment, not merely at runtime.
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
      variables: present,
      missing,
      database,
      databaseError,
      data: { tables, subjects, tutors },
    },
    200,
    { "Cache-Control": "no-store" },
  );
}
