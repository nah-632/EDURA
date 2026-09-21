import { z } from "zod";

import { refundPayment, rejectPayment, verifyPayment } from "@/lib/admin/actions";
import { actionErrorResponse, parseBody } from "@/lib/admin/api";
import { requireAdminApi } from "@/lib/admin/guard";
import { jsonResponse } from "@/lib/security/http";
import { reasonSchema, shortText } from "@/lib/validation/schemas";
export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("verify"),
    paymentId: z.string().uuid(),
    reference: shortText(2, 120).optional().nullable(),
  }),
  z.object({ action: z.literal("reject"), paymentId: z.string().uuid(), reason: reasonSchema }),
  z.object({ action: z.literal("refund"), paymentId: z.string().uuid(), reason: reasonSchema }),
]);

/**
 * POST /api/admin/payments
 *
 * Verifying a booking payment also advances the booking through
 * `payment_verification -> paid`; verifying a subscription payment activates
 * the subscription. Both follow-ups run through the same audited functions the
 * rest of the platform uses, so the money record and the state can never tell
 * two different stories.
 */
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  const permission = input.action === "refund" ? "payment.refund" : "payment.verify";
  const gate = await requireAdminApi(request, permission);
  if (!gate.ok) return gate.response;

  try {
    if (input.action === "verify") {
      const result = await verifyPayment(gate.ctx, { paymentId: input.paymentId, reference: input.reference ?? null });
      return jsonResponse({ ok: true, ...result });
    }
    if (input.action === "reject") {
      const result = await rejectPayment(gate.ctx, { paymentId: input.paymentId, reason: input.reason });
      return jsonResponse({ ok: true, ...result });
    }
    if (input.action === "refund") {
      const result = await refundPayment(gate.ctx, { paymentId: input.paymentId, reason: input.reason });
      return jsonResponse({ ok: true, ...result });
    }
    return jsonResponse({ ok: false, error: "validation" }, 422);
  } catch (err) {
    return actionErrorResponse(err);
  }
}
