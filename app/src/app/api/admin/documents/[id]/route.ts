import { createDocumentAccessLink } from "@/lib/documents/service";
import { requireAdminApi } from "@/lib/admin/guard";
import { apiError, jsonResponse } from "@/lib/security/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/documents/:id
 *
 * The ONLY way to read a tutor document (§21). It mints a five-minute signed
 * URL and writes an audit entry naming the admin, the document and the tutor
 * BEFORE returning the link - if the audit write fails, no link is issued.
 *
 * The response is `no-store` so the signed URL is never cached by a proxy, and
 * the storage path itself is never returned.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const gate = await requireAdminApi(request, "tutor.document.read");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiError("validation", 422);

  try {
    const link = await createDocumentAccessLink({
      adminUserId: gate.ctx.actorUserId,
      adminLabel: gate.ctx.actorLabel,
      documentId: id,
      ip: gate.ctx.ip,
    });
    if (!link) return apiError("not_found", 404);
    return jsonResponse({
      ok: true,
      url: link.url,
      expiresAt: link.expiresAt,
      documentId: link.documentId,
      mimeType: link.mimeType,
    });
  } catch (err) {
    // Storage not configured is an honest 501: the console shows the reason
    // rather than a broken link.
    const message = err instanceof Error ? err.message : "unknown";
    if (/not configured|missing/i.test(message)) return apiError("not_configured", 501);
    console.error("[admin/documents] failed", message);
    return apiError("unexpected", 500);
  }
}
