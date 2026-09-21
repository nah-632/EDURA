import { z } from "zod";

import { upsertPlan } from "@/lib/admin/content";
import { actionErrorResponse, parseBody } from "@/lib/admin/api";
import { requireAdminApi } from "@/lib/admin/guard";
import { jsonResponse } from "@/lib/security/http";
import { planSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ action: z.literal("upsert"), plan: planSchema });

/**
 * POST /api/admin/plans
 *
 * Subscription pricing is business data (§3, §37): editing it here changes what
 * the pricing page and the tutor's renewal screen display, because both read
 * the `subscription_plans` table rather than a constant.
 */
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const gate = await requireAdminApi(request, "plan.manage");
  if (!gate.ok) return gate.response;

  try {
    const result = await upsertPlan(gate.ctx, {
      id: parsed.data.plan.id ?? null,
      code: parsed.data.plan.code,
      nameAr: parsed.data.plan.nameAr,
      nameEn: parsed.data.plan.nameEn,
      price: parsed.data.plan.price,
      interval: parsed.data.plan.interval,
      durationDays: parsed.data.plan.durationDays,
      graceDays: parsed.data.plan.graceDays,
      isActive: parsed.data.plan.isActive,
      sortOrder: parsed.data.plan.sortOrder,
    });
    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    return actionErrorResponse(err);
  }
}
