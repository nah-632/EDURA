import { createPaymentProofLink } from "@/lib/documents/service";
import { requireAdminApi } from "@/lib/admin/guard";
import { apiError, jsonResponse } from "@/lib/security/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/payment-proofs/:id
 *
 * A payment proof uploaded through the platform is private: it is readable only
 * through this endpoint, which writes an audit row before minting a short-lived
 * signed URL. A proof that arrived on WhatsApp has no stored file, so this
 * answers 404 - the console shows the recorded note instead of inventing a file.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const gate = await requireAdminApi(request, "payment.read");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiError("validation", 422);

  try {
    const link = await createPaymentProofLink({
      adminUserId: gate.ctx.actorUserId,
      adminLabel: gate.ctx.actorLabel,
      proofId: id,
      ip: gate.ctx.ip,
    });
    if (!link) return apiError("not_found", 404);
    return jsonResponse({ ok: true, url: link.url, expiresAt: link.expiresAt, proofId: id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (/not configured|missing/i.test(message)) return apiError("not_configured", 501);
    console.error("[admin/payment-proofs] failed", message);
    return apiError("unexpected", 500);
  }
}
