import { z } from "zod";

import { AuthError, requireTutor } from "@/lib/auth/service";
import { addTimeOff, removeTimeOff, saveAvailability, saveTutorProfile } from "@/lib/tutor/service";
import { getTutorSubscriptionView } from "@/lib/subscriptions/service";
import { requestPlan } from "@/lib/subscriptions/service";
import { apiError, isSameOrigin, jsonResponse } from "@/lib/security/http";
import { availabilitySchema, tutorProfileSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * GET  /api/tutor - the tutor's own profile, availability and subscription
 * POST /api/tutor - save profile, save availability, manage time off, request a plan
 *
 * `requireTutor()` resolves the tutor from the SESSION, so a tutor can only ever
 * read or write their own profile - there is no tutor id in the request.
 */
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_profile"), profile: tutorProfileSchema }),
  z.object({ action: z.literal("save_availability"), windows: z.array(availabilitySchema).max(40) }),
  z.object({
    action: z.literal("add_time_off"),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    reason: z.string().trim().max(300).optional().nullable(),
  }),
  z.object({ action: z.literal("remove_time_off"), id: z.string().uuid() }),
  z.object({ action: z.literal("request_plan"), planId: z.string().uuid() }),
]);

export async function GET(request: Request): Promise<Response> {
  let tutor;
  try {
    tutor = await requireTutor(request);
  } catch (err) {
    if (err instanceof AuthError) return apiError(err.code, err.code === "not_a_tutor" ? 403 : 401);
    return apiError("unauthorized", 401);
  }
  try {
    const subscription = await getTutorSubscriptionView(tutor.tutorId);
    return jsonResponse({ ok: true, tutorId: tutor.tutorId, subscription });
  } catch (err) {
    console.error("[api/tutor] get", err instanceof Error ? err.message : "unknown");
    return apiError("unexpected", 500);
  }
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
    if (parsed.data.action === "save_profile") {
      const result = await saveTutorProfile(tutor.session.user.id, parsed.data.profile);
      return jsonResponse({ ok: true, ...result });
    }
    if (parsed.data.action === "save_availability") {
      await saveAvailability(tutor.session.user.id, tutor.tutorId, parsed.data.windows);
      return jsonResponse({ ok: true });
    }
    if (parsed.data.action === "add_time_off") {
      if (new Date(parsed.data.endsAt) <= new Date(parsed.data.startsAt)) {
        return apiError("validation", 422, "invalidRange");
      }
      const result = await addTimeOff(tutor.session.user.id, tutor.tutorId, {
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        reason: parsed.data.reason ?? null,
      });
      return jsonResponse({ ok: true, ...result }, 201);
    }
    if (parsed.data.action === "remove_time_off") {
      const removed = await removeTimeOff(tutor.session.user.id, tutor.tutorId, parsed.data.id);
      if (!removed) return apiError("not_found", 404);
      return jsonResponse({ ok: true });
    }

    // Renewal request: creates a PENDING subscription plus a payment record.
    // Nothing is activated here - an admin verifies the BenefitPay transfer.
    const result = await requestPlan({
      tutorId: tutor.tutorId,
      tutorUserId: tutor.session.user.id,
      planId: parsed.data.planId,
    });
    return jsonResponse({ ok: true, ...result }, 201);
  } catch (err) {
    const code = err instanceof Error ? err.message : "unexpected";
    if (code === "not_found" || code === "plan_not_found") return apiError("not_found", 404);
    if (code === "already_pending") return apiError("duplicate", 409);
    if (code === "password_policy") return apiError("validation", 422);
    console.error("[api/tutor] post", code);
    return apiError("unexpected", 500);
  }
}
