import { z } from "zod";

import { AuthError, requireTutor } from "@/lib/auth/service";
import { DOCUMENT_KINDS, listTutorDocuments, saveTutorDocument } from "@/lib/documents/service";
import { apiError, isSameOrigin, jsonResponse } from "@/lib/security/http";
import { LIMITS, bucketKey, DbRateLimiter } from "@/lib/security/ratelimit";
import { UPLOAD_LIMITS } from "@/lib/upload/validate";

export const dynamic = "force-dynamic";

const kindSchema = z.enum(DOCUMENT_KINDS);

/**
 * GET  /api/tutor/documents - metadata only, never a URL (§21)
 * POST /api/tutor/documents - upload a verification document (multipart)
 *
 * The storage path is generated on the server from the tutor id and the new
 * document id, so an uploader cannot choose - or overwrite - a location. Type is
 * decided from magic bytes, not from the declared content type or extension.
 */
export async function GET(request: Request): Promise<Response> {
  let tutor;
  try {
    tutor = await requireTutor(request);
  } catch (err) {
    if (err instanceof AuthError) return apiError(err.code, err.code === "not_a_tutor" ? 403 : 401);
    return apiError("unauthorized", 401);
  }
  const documents = await listTutorDocuments(tutor.tutorId);
  return jsonResponse({ ok: true, documents });
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

  const limiter = new DbRateLimiter();
  try {
    const limit = await limiter.hit(
      bucketKey("upload", tutor.session.user.id),
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

  const kind = kindSchema.safeParse(String(form.get("kind") ?? ""));
  if (!kind.success) return apiError("validation", 422, "kind");

  const file = form.get("file");
  if (!(file instanceof File)) return apiError("validation", 422, "file");
  if (file.size > UPLOAD_LIMITS.maxBytes) return apiError("validation", 413, "too_large");

  try {
    const result = await saveTutorDocument({
      tutorId: tutor.tutorId,
      uploadedBy: tutor.session.user.id,
      kind: kind.data,
      bytes: new Uint8Array(await file.arrayBuffer()),
      declaredType: file.type || null,
      filename: file.name || null,
    });
    if (!result.ok) return apiError("validation", 422, result.error);
    return jsonResponse({ ok: true, document: result.document }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (/not configured|missing/i.test(message)) return apiError("not_configured", 501);
    console.error("[api/tutor/documents]", message);
    return apiError("unexpected", 500);
  }
}
