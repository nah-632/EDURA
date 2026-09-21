/**
 * Shared plumbing for admin API routes.
 *
 * Two jobs: parse a body against a schema without leaking the validation
 * library's messages to the browser, and translate a domain `ActionError` into
 * a stable HTTP code. Keeping this in one place means every admin route answers
 * failures in the same shape as the public API (`{ ok: false, error }`), so the
 * console has one error renderer.
 */
import type { z } from "zod";

import { apiError } from "@/lib/security/http";
import { ActionError } from "./actions";

export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: apiError("validation", 422) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.join(".") ?? undefined;
    return { ok: false, response: apiError("validation", 422, field) };
  }
  return { ok: true, data: parsed.data };
}

const ACTION_STATUS: Record<string, number> = {
  not_found: 404,
  invalid_state: 409,
  invalid_transition: 409,
  already_done: 409,
  conflict: 409,
  reason_required: 422,
};

/**
 * Map a thrown error to a response. Anything unrecognised is logged and
 * answered as a generic 500 - the operator sees a stable code, and the stack
 * trace stays in the server logs.
 */
export function actionErrorResponse(err: unknown): Response {
  if (err instanceof ActionError) {
    return apiError(err.code, ACTION_STATUS[err.code] ?? 400, err.message === err.code ? undefined : err.message);
  }
  const code = err instanceof Error ? err.name : "unknown";
  if (code === "TransitionError") return apiError("invalid_transition", 409);
  if (err instanceof Error && /not_found/.test(err.message)) return apiError("not_found", 404);
  if (err instanceof Error && /already_pending/.test(err.message)) return apiError("duplicate", 409);
  console.error("[admin/api] unexpected", err instanceof Error ? err.message : "unknown");
  return apiError("unexpected", 500);
}
