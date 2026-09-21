import { z } from "zod";

import {
  activateTutorSubscription,
  applyTutorAction,
  cancelTutorSubscription,
  decideTutorDocument,
  updateTutorByAdmin,
} from "@/lib/admin/actions";
import { actionErrorResponse, parseBody } from "@/lib/admin/api";
import { requireAdminApi } from "@/lib/admin/guard";
import { jsonResponse } from "@/lib/security/http";
import { money, optionalText, reasonSchema, shortText } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/tutors
 *
 * One route per resource with an `action` discriminator: the console performs
 * five different tutor operations, and five near-identical files would be
 * harder to audit than one contract with an explicit action list.
 *
 * Authorization happens per action, not per route, because the permissions
 * differ (a moderator may review documents but not approve a profile).
 */
const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.enum(["under_review", "approve", "reject", "suspend", "reactivate"]),
    tutorId: z.string().uuid(),
    reason: reasonSchema.optional().nullable(),
  }),
  z.object({
    action: z.literal("edit"),
    tutorId: z.string().uuid(),
    headlineAr: optionalText(140),
    headlineEn: optionalText(140),
    adminNotes: optionalText(1000),
    pricePerHour: money.optional().nullable(),
    teachesHome: z.boolean().optional(),
    teachesOnline: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("document_decision"),
    documentId: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
    reason: reasonSchema.optional().nullable(),
  }),
  z.object({
    action: z.literal("activate_subscription"),
    tutorId: z.string().uuid(),
    planId: z.string().uuid(),
    subscriptionId: z.string().uuid().optional().nullable(),
    // The console collects one optional amount; it is turned into the nested
    // record here so the action layer keeps a single shape.
    recordPaymentAmount: money.optional().nullable(),
    recordPaymentReference: shortText(2, 60).optional().nullable(),
  }),
  z.object({
    action: z.literal("cancel_subscription"),
    tutorId: z.string().uuid(),
    reason: reasonSchema,
  }),
]);

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  const permission =
    input.action === "reject"
      ? "tutor.reject"
      : input.action === "suspend"
        ? "tutor.suspend"
        : input.action === "activate_subscription" || input.action === "cancel_subscription"
          ? "subscription.manage"
          : input.action === "edit" || input.action === "document_decision"
            ? "tutor.edit"
            : "tutor.approve";

  const gate = await requireAdminApi(request, permission);
  if (!gate.ok) return gate.response;
  const { ctx } = gate;

  try {
    switch (input.action) {
      case "under_review":
      case "approve":
      case "reject":
      case "suspend":
      case "reactivate": {
        const result = await applyTutorAction(ctx, {
          tutorId: input.tutorId,
          action: input.action,
          reason: input.reason ?? null,
        });
        return jsonResponse({ ok: true, ...result });
      }
      case "edit": {
        await updateTutorByAdmin(ctx, {
          tutorId: input.tutorId,
          headlineAr: input.headlineAr ?? null,
          headlineEn: input.headlineEn ?? null,
          adminNotes: input.adminNotes ?? null,
          pricePerHour: input.pricePerHour ?? null,
          teachesHome: input.teachesHome,
          teachesOnline: input.teachesOnline,
        });
        return jsonResponse({ ok: true });
      }
      case "document_decision": {
        const result = await decideTutorDocument(ctx, {
          documentId: input.documentId,
          decision: input.decision,
          reason: input.reason ?? null,
        });
        return jsonResponse({ ok: true, ...result });
      }
      case "activate_subscription": {
        const result = await activateTutorSubscription(ctx, {
          tutorId: input.tutorId,
          planId: input.planId,
          subscriptionId: input.subscriptionId ?? null,
          recordPayment: input.recordPaymentAmount
            ? { amount: input.recordPaymentAmount, reference: input.recordPaymentReference ?? null }
            : undefined,
        });
        return jsonResponse({ ok: true, startsAt: result.startsAt, expiresAt: result.expiresAt });
      }
      case "cancel_subscription": {
        await cancelTutorSubscription(ctx, { tutorId: input.tutorId, reason: input.reason });
        return jsonResponse({ ok: true });
      }
      default:
        return jsonResponse({ ok: false, error: "validation" }, 422);
    }
  } catch (err) {
    return actionErrorResponse(err);
  }
}
