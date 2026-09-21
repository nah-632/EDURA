import { z } from "zod";

import { requireUser } from "@/lib/auth/service";
import {
  BookingActionError,
  cancelBookingAsCustomer,
  requestRefundAsCustomer,
} from "@/lib/bookings/actions";
import { listCustomerBookings } from "@/lib/bookings/queries";
import { apiError, isSameOrigin, jsonResponse } from "@/lib/security/http";
import { reasonSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), bookingId: z.string().uuid() }),
  z.object({ action: z.literal("request_refund"), bookingId: z.string().uuid(), reason: reasonSchema }),
]);

/**
 * GET  /api/me/bookings - the customer's own bookings
 * POST /api/me/bookings - cancel, or ask for a refund
 *
 * Both actions run through the shared state machine with the actor set to
 * `customer`; a customer can therefore never perform a tutor or admin move,
 * regardless of what the request claims.
 */
export async function GET(request: Request): Promise<Response> {
  let session;
  try {
    session = await requireUser(request);
  } catch {
    return apiError("unauthorized", 401);
  }
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  const bookings = await listCustomerBookings(
    session.user.id,
    scope === "upcoming" || scope === "past" ? scope : "all",
  );
  return jsonResponse({ ok: true, bookings });
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request, request.headers)) return apiError("forbidden", 403);

  let session;
  try {
    session = await requireUser(request);
  } catch {
    return apiError("unauthorized", 401);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("validation", 422);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return apiError("validation", 422);

  try {
    if (parsed.data.action === "cancel") {
      const result = await cancelBookingAsCustomer(session.user.id, parsed.data.bookingId);
      return jsonResponse({ ok: true, ...result });
    }
    await requestRefundAsCustomer(session.user.id, parsed.data.bookingId, parsed.data.reason);
    return jsonResponse({ ok: true });
  } catch (err) {
    if (err instanceof BookingActionError) {
      if (err.code === "not_found") return apiError("not_found", 404);
      if (err.code === "invalid_transition") return apiError("invalid_transition", 409);
      if (err.code === "not_configured") return apiError("not_configured", 501);
      return apiError("validation", 422, err.code);
    }
    console.error("[api/me/bookings]", err instanceof Error ? err.message : "unknown");
    return apiError("unexpected", 500);
  }
}
