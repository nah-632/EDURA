/**
 * Session access for SERVER COMPONENTS.
 *
 * Route handlers receive a `Request`; pages do not, so they read the incoming
 * cookie header through `next/headers`. Both paths end in the same
 * `sessionFromCookieHeader`, so a page and an API route can never disagree about
 * who is signed in.
 */
import { headers as requestHeaders } from "next/headers";

import { type SessionContext, sessionFromCookieHeader } from "./service";

export async function currentSession(): Promise<SessionContext | null> {
  const headers = await requestHeaders();
  return sessionFromCookieHeader(headers.get("cookie"));
}

export type PageGate =
  | { ok: true; session: SessionContext }
  | { ok: false; reason: "unauthenticated" | "not_a_tutor" };

/**
 * Page guard for the customer area. `not_a_tutor` is returned separately so the
 * tutor area can explain the difference between "sign in" and "this account is
 * not a tutor profile" instead of bouncing the visitor to a login page they are
 * already signed in to.
 */
export async function requirePageSession(opts: { requireTutor?: boolean } = {}): Promise<PageGate> {
  const session = await currentSession();
  if (!session) return { ok: false, reason: "unauthenticated" };
  if (opts.requireTutor && !session.user.tutorId) return { ok: false, reason: "not_a_tutor" };
  return { ok: true, session };
}
