import { z } from "zod";

import { setBookingStatus, setBookingZoomLink } from "@/lib/admin/actions";
import { actionErrorResponse, parseBody } from "@/lib/admin/api";
import { requireAdminApi } from "@/lib/admin/guard";
import { bookingStatuses } from "@/lib/booking/state";
import { jsonResponse } from "@/lib/security/http";
import { reasonSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_status"),
    bookingId: z.string().uuid(),
    // The list is the state machine itself, so an unknown status is rejected
    // by validation before it can reach the transition check.
    to: z.enum(bookingStatuses),
    reason: reasonSchema.optional().nullable(),
  }),
  z.object({
    action: z.literal("set_zoom"),
    bookingId: z.string().uuid(),
    zoomUrl: z.string().trim().url().max(500).nullable(),
  }),
]);

/**
 * POST /api/admin/bookings
 *
 * A status change is only ever applied through the shared state machine
 * (lib/booking/state.ts) - the same function that guards the customer and tutor
 * paths - so the console cannot invent a transition the domain does not allow.
 */
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  const gate = await requireAdminApi(
    request,
    input.action === "set_status" && input.to === "cancelled" ? "booking.cancel" : "booking.update",
  );
  if (!gate.ok) return gate.response;

  try {
    if (input.action === "set_zoom") {
      await setBookingZoomLink(gate.ctx, { bookingId: input.bookingId, zoomUrl: input.zoomUrl });
      return jsonResponse({ ok: true });
    }
    const result = await setBookingStatus(gate.ctx, {
      bookingId: input.bookingId,
      to: input.to,
      reason: input.reason ?? null,
    });
    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    return actionErrorResponse(err);
  }
}
