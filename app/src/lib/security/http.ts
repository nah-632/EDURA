/**
 * Request-derived security helpers.
 *
 * The client address is taken from the proxy headers in the order that a
 * Vercel edge actually sets them: `x-real-ip` first, otherwise the LAST entry
 * of `x-forwarded-for`. Taking the first entry of a client-supplied
 * `x-forwarded-for` would let anyone rotate the subject of a rate limit by
 * inventing a header.
 */

export function getClientIp(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  const vercel = headers.get("x-vercel-forwarded-for")?.split(",").pop()?.trim();
  return vercel ?? null;
}

export function getUserAgent(headers: Headers): string | null {
  const ua = headers.get("user-agent");
  return ua ? ua.slice(0, 300) : null;
}

/** Basic CSRF defence: state-changing requests must come from our own origin. */
export function isSameOrigin(request: Request, headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) {
    // Same-origin form posts and server-to-server calls may omit Origin; the
    // session cookie is SameSite=Lax, so a cross-site POST cannot carry it.
    return true;
  }
  const host = headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Security headers used by API responses (the HTML ones live in next.config). */
export const API_SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...API_SECURITY_HEADERS, ...headers },
  });
}

/**
 * Client-facing error shape. Internal codes (SQLSTATEs, driver text, stack
 * traces) never reach the browser: they are mapped to a stable code the UI
 * translates, and the detail is left in the logs.
 */
export interface ApiErrorBody {
  ok: false;
  error: string;
  detail?: string;
}

export function apiError(error: string, status: number, detail?: string): Response {
  const body: ApiErrorBody = { ok: false, error, ...(detail ? { detail } : {}) };
  return jsonResponse(body, status);
}

/** Map internal error codes to HTTP status without leaking anything. */
export function statusForError(code: string): number {
  switch (code) {
    case "unauthorized":
    case "session_expired":
      return 401;
    case "forbidden":
    case "admin_required":
      return 403;
    case "not_found":
      return 404;
    case "slot_taken":
    case "duplicate":
      return 409;
    case "rate_limited":
      return 429;
    case "validation":
      return 422;
    case "not_configured":
      return 501;
    default:
      return 400;
  }
}
