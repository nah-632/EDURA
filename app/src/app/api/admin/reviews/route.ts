import { z } from "zod";

import { moderateReview } from "@/lib/admin/content";
import { actionErrorResponse, parseBody } from "@/lib/admin/api";
import { requireAdminApi } from "@/lib/admin/guard";
import { jsonResponse } from "@/lib/security/http";
import { optionalText } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reviewId: z.string().uuid(),
  action: z.enum(["publish", "hide", "restore", "report"]),
  note: optionalText(500),
});

/**
 * POST /api/admin/reviews
 *
 * Moderation recomputes the tutor's rating from the PUBLISHED rows only, so
 * hiding a review immediately removes its effect on the visible rating rather
 * than leaving a number that no reader can account for.
 */
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const gate = await requireAdminApi(request, "review.moderate");
  if (!gate.ok) return gate.response;

  try {
    const result = await moderateReview(gate.ctx, {
      reviewId: parsed.data.reviewId,
      action: parsed.data.action,
      note: parsed.data.note ?? null,
    });
    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    return actionErrorResponse(err);
  }
}
