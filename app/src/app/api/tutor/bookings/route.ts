import { z } from "zod";

import { AuthError, requireTutor } from "@/lib/auth/service";
import { decideBookingAsTutor, progressBookingAsTutor, setZoomLinkAsTutor } from "@/lib/bookings/actions";
import { listTutorBookings } from "@/lib/bookings/queries";
import { apiError, isSameOrigin, jsonResponse } from "@/lib/security/http";
import { reasonSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), bookingId: z.string().uuid() }),
  z.object({ action: z.literal("decline"), bookingId: z.string().uuid(), reason: reasonSchema }),
  z.object({
    action: z.literal("progress"),
    bookingId: z.string().uuid(),
    to: z.enum(["scheduled", "in_progress", "completed"]),
  }),
  z.object({
    action: z.literal("set_meeting_link"),
    bookingId: z.string().uuid(),
    url: z.string().trim().url().max(500).nullable(),
  }),
]);

/**
 * GET  /api/tutor/bookings - requests / upcoming / past for this tutor
 * POST /api/tutor/bookings - accept, decline, progress, or set a meeting link
 *
 * Every action resolves the booking THROUGH the tutor id from the session
 * (`loadForTutor`), so a booking id belonging to another tutor matches nothing.
 */
export async function GET(request: Request): Promise<Response> {
  let tutor;
  try {
    tutor = await requireTutor(request);
  } catch (err) {
    if (err instanceof AuthError) return apiError(err.code, err.code === "not_a_tutor" ? 403 : 401);
    return apiError("unauthorized", 401);
  }
  const scope = new URL(request.url).searchParams.get("scope");
  const allowed = ["requests", "upcoming", "past", "all"] as const;
  const chosen = allowed.includes(scope as (typeof allowed)[number])
    ? (scope as (typeof allowed)[number])
    : "all";
  const bookings = await listTutorBookings(tutor.tutorId, chosen);
  return jsonResponse({ ok: true, bookings });
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request, request.headers)) return apiError("forbidden", 403);

  let tutor;
  try {
    tutor = await requireTutor(request);
  } catch (err) {
    if (err instanceof AuthError) return apiError(err.code, err.code === "not_a_tutor" ? 403 : 401);
    return apiError("unauthorized", 401);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("validation", 422);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return apiError("validation", 422, parsed.error.issues[0]?.path.join("."));

  try {
    if (parsed.data.action === "accept" || parsed.data.action === "decline") {
      const result = await decideBookingAsTutor(
        tutor.tutorId,
        parsed.data.bookingId,
        parsed.data.action,
        parsed.data.action === "decline" ? parsed.data.reason : null,
      );
      return jsonResponse({ ok: true, ...result });
    }
    if (parsed.data.action === "progress") {
      const result = await progressBookingAsTutor(tutor.tutorId, parsed.data.bookingId, parsed.data.to);
      return jsonResponse({ ok: true, ...result });
    }
    await setZoomLinkAsTutor(tutor.tutorId, parsed.data.bookingId, parsed.data.url);
    return jsonResponse({ ok: true });
  } catch (err) {
    const code = err instanceof Error ? err.message : "unexpected";
    if (code === "invalid_transition") return apiError("invalid_transition", 409);
    if (code === "policy" || code === "invalid_meeting_link") return apiError("validation", 422, code);
    if (code === "not_found") return apiError("not_found", 404);
    if (code === "not_configured") return apiError("not_configured", 501);
    console.error("[api/tutor/bookings]", code);
    return apiError("unexpected", 500);
  }
}
