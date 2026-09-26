import { dbConfigured, getPool } from "@/lib/db";
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

/**
 * The shape of the configured connection string, never its secret parts.
 *
 * `dns_not_found` says the hostname does not resolve, but not *why* — and the
 * three ways an operator gets there (a trailing quote, a leading variable name,
 * a stray newline) all look identical from outside. This reports only what is
 * needed to tell those apart: the parsed host, the port, and three booleans.
 * The user, the password and the database name are never returned.
 */
function connectionShape(): Record<string, unknown> | null {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  const trimmed = raw.trim();
  const out: Record<string, unknown> = {
    hasSurroundingQuotes: /^["']|["']$/.test(trimmed),
    hasVariableNamePrefix: /^(?:export\s+)?DATABASE_URL\s*=/.test(trimmed),
    hasWhitespaceInside: /\s/.test(trimmed),
    startsWithPostgresScheme: /^postgres(ql)?:\/\//.test(trimmed),
  };
  try {
    const url = new URL(trimmed.replace(/^["']|["']$/g, ""));
    out.host = url.hostname;
    out.port = url.port || "(default)";
    out.database = url.pathname.replace(/^\//, "") || "(none)";
    out.userLooksLikeSupabasePooler = /^postgres\.[a-z]{20}$/.test(decodeURIComponent(url.username));
  } catch {
    out.host = null;
    out.parseError = "the value is not a parseable URL";
  }
  return out;
}

function classify(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code ?? "";
  const hay = `${code} ${message}`.toLowerCase();
  if (/enotfound|eai_again|getaddrinfo/.test(hay)) return "dns_not_found";
  if (/econnrefused/.test(hay)) return "connection_refused";
  if (/etimedout|connection timeout|timeout expired/.test(hay)) return "timeout";
  if (/28p01|password authentication failed|sasl|role .* does not exist|invalid_authorization/.test(hay))
    return "auth_failed";
  if (/invalid url|uri malformed|invalid connection string|parse/.test(hay))
    return "malformed_connection_string";
  if (/self.signed|certificate|tls|ssl/.test(hay)) return "tls";
  if (/no pg_hba|not allowed|ehostunreach|enetunreach/.test(hay)) return "network_blocked";
  return "unknown";
}

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
  let connection: Record<string, unknown> | null = null;

  if (dbConfigured()) {
    try {
      // The pool directly, NOT the app's `query()` helper: that helper maps
      // driver failures to a deliberately opaque `database_error`, which is
      // right for a user-facing response and useless for diagnosis.
      const result = await getPool().query<{ tables: number; subjects: number; tutors: number }>(
        `select
           (select count(*)::int from information_schema.tables
             where table_schema = 'public' and table_type = 'BASE TABLE') as tables,
           (select count(*)::int from subjects) as subjects,
           (select count(*)::int from tutors) as tutors`,
      );
      database = "connected";
      tables = result.rows[0]?.tables ?? null;
      subjects = result.rows[0]?.subjects ?? null;
      tutors = result.rows[0]?.tutors ?? null;
    } catch (err) {
      database = "unreachable";
      databaseError = classify(err);
      connection = connectionShape();
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
      connection,
      data: { tables, subjects, tutors },
    },
    200,
    { "Cache-Control": "no-store" },
  );
}
