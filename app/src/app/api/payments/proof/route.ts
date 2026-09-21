import { requireUser } from "@/lib/auth/service";
import { paymentBelongsToUser, submitPaymentProof, type ProofInput } from "@/lib/payments/service";
import { apiError, getClientIp, getUserAgent, isSameOrigin, jsonResponse } from "@/lib/security/http";
import { LIMITS, bucketKey, DbRateLimiter } from "@/lib/security/ratelimit";
import { UPLOAD_LIMITS } from "@/lib/upload/validate";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/proof  (multipart/form-data)
 *
 * Two honest ways to record a BenefitPay proof (§36):
 *  - `source=in_platform` with a `file` part: stored in the PRIVATE bucket,
 *    readable only through an admin's audited signed link;
 *  - `source=whatsapp_external` with a `note`: the proof arrived in a WhatsApp
 *    chat, and the platform records THAT FACT rather than claiming to have
 *    imported a message it never saw.
 *
 * A customer can submit. Only an admin can verify - so nothing here marks a
 * payment as paid.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request, request.headers)) return apiError("forbidden", 403);

  let session;
  try {
    session = await requireUser(request);
  } catch {
    return apiError("unauthorized", 401);
  }

  const limiter = new DbRateLimiter();
  try {
    const limit = await limiter.hit(
      bucketKey("upload", session.user.id),
      LIMITS.upload.limit,
      LIMITS.upload.windowSeconds,
    );
    if (!limit.allowed) return apiError("rate_limited", 429);
  } catch {
    return apiError("rate_limited", 429);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("validation", 422);
  }

  const paymentId = String(form.get("paymentId") ?? "");
  const source = String(form.get("source") ?? "in_platform");
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return apiError("validation", 422);
  if (source !== "in_platform" && source !== "whatsapp_external") return apiError("validation", 422);

  // Ownership is checked before anything is read from the body, so an
  // unowned payment id never causes storage work.
  try {
    if (!(await paymentBelongsToUser(paymentId, session.user.id))) return apiError("not_found", 404);
  } catch (err) {
    console.error("[api/payments/proof] ownership", err instanceof Error ? err.message : "unknown");
    return apiError("unexpected", 500);
  }

  const proof: ProofInput = { source };
  if (source === "whatsapp_external") {
    proof.note = String(form.get("note") ?? "").slice(0, 600);
  } else {
    const file = form.get("file");
    if (!(file instanceof File)) return apiError("validation", 422, "file");
    if (file.size > UPLOAD_LIMITS.maxBytes) return apiError("validation", 413, "too_large");
    proof.bytes = new Uint8Array(await file.arrayBuffer());
    proof.declaredType = file.type || null;
    proof.filename = file.name || null;
  }
  proof.customerReference = form.get("reference") ? String(form.get("reference")).slice(0, 120) : null;

  try {
    const result = await submitPaymentProof(
      { userId: session.user.id, paymentId, proof },
      { ip: getClientIp(request.headers), userAgent: getUserAgent(request.headers) },
    );
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : result.error === "already_verified" ? 409 : 422;
      return apiError(result.error, status);
    }
    return jsonResponse({ ok: true, proofId: result.proofId }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (/not configured|missing/i.test(message)) return apiError("not_configured", 501);
    console.error("[api/payments/proof] failed", message);
    return apiError("unexpected", 500);
  }
}
