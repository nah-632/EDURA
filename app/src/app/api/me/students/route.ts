import { z } from "zod";

import { requireUser } from "@/lib/auth/service";
import { createStudent, deleteStudent, listStudents, updateStudent } from "@/lib/students/service";
import { apiError, getClientIp, getUserAgent, isSameOrigin, jsonResponse } from "@/lib/security/http";
import { studentSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

/**
 * GET    /api/me/students        - the account's own students
 * POST   /api/me/students        - create / update / delete
 *
 * Minor data (§7.1): the owner is always the session user, so there is no id to
 * guess, and a delete anonymises the record instead of removing the row (the
 * bookings that reference it are financial records).
 */
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), student: studentSchema }),
  z.object({ action: z.literal("update"), id: z.string().uuid(), student: studentSchema }),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
]);

export async function GET(request: Request): Promise<Response> {
  let session;
  try {
    session = await requireUser(request);
  } catch {
    return apiError("unauthorized", 401);
  }
  const students = await listStudents(session.user.id);
  return jsonResponse({ ok: true, students });
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
    // Slice A+K: consent metadata (ip + user agent) is captured with every
    // guardian-link creation so the declaration is documented, not anonymous.
    const consent = {
      ip: getClientIp(request.headers),
      userAgent: getUserAgent(request.headers),
    };
    if (parsed.data.action === "create") {
      const result = await createStudent(session.user.id, parsed.data.student, consent);
      return jsonResponse({ ok: true, ...result }, 201);
    }
    if (parsed.data.action === "update") {
      const updated = await updateStudent(session.user.id, parsed.data.id, parsed.data.student);
      if (!updated) return apiError("not_found", 404);
      return jsonResponse({ ok: true });
    }
    const deleted = await deleteStudent(session.user.id, parsed.data.id);
    if (!deleted) return apiError("not_found", 404);
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[api/me/students]", err instanceof Error ? err.message : "unknown");
    return apiError("unexpected", 500);
  }
}
