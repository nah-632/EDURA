import { z } from "zod";

import { requireAdminApi } from "@/lib/admin/guard";
import { applyGuardianLinkDecision, guardianLinkStatus } from "@/lib/guardian/service";
import { query } from "@/lib/db";
import { apiError, getClientIp, getUserAgent, jsonResponse } from "@/lib/security/http";

export const dynamic = "force-dynamic";

const decisionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("verify"),
    linkId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("revoke"),
    linkId: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
  }),
]);

/**
 * Admin guardian-link console API (slice A+K, backend only — no UI yet).
 *
 * GET  ?studentId=<uuid>            — the caller's link status for one student
 * GET  ?status=pending|verified|revoked — the review queue
 * POST { action: verify | revoke }  — a decision, always audited. Revoke
 *                                      REQUIRES a reason (same rule as
 *                                      tutor.suspend / user.restrict).
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const studentId = url.searchParams.get("studentId");
  if (studentId) {
    // Per-student lookup is used by operators while reviewing a booking; it
    // leaks only the link status of an id the caller names, never student data.
    let guardianUserId = url.searchParams.get("guardianUserId");
    if (!guardianUserId) return apiError("validation", 422, "guardianUserId_required");
    const status = await guardianLinkStatus(studentId, guardianUserId);
    return jsonResponse({ ok: true, status });
  }

  const gate = await requireAdminApi(request, "guardian.verify");
  if (!gate.ok) return gate.response;

  const status = url.searchParams.get("status");
  const allowed = ["pending", "verified", "revoked"] as const;
  const filter = allowed.includes(status as (typeof allowed)[number])
    ? `where g.verification_status = $1`
    : "";
  const params = filter ? [status] : [];
  const rows = await query(
    `select g.id::text as id, g.student_id::text as "studentId",
            g.guardian_user_id::text as "guardianUserId",
            g.relationship_type::text as "relationshipType",
            g.verification_status::text as "verificationStatus",
            g.verification_method as "verificationMethod",
            g.consent_granted_at as "consentGrantedAt",
            g.verified_at as "verifiedAt", g.revoked_at as "revokedAt",
            g.created_at as "createdAt"
       from guardian_links g
       ${filter}
      order by g.created_at desc
      limit 200`,
    params,
  );
  return jsonResponse({ ok: true, links: rows });
}

export async function POST(request: Request): Promise<Response> {
  const gate = await requireAdminApi(request, "guardian.verify");
  if (!gate.ok) return gate.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("validation", 422);
  }
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) return apiError("validation", 422);

  try {
    const result = await applyGuardianLinkDecision({
      linkId: parsed.data.linkId,
      decision: parsed.data.action === "verify" ? "verify" : "revoke",
      adminUserId: gate.ctx.actorUserId,
      adminLabel: gate.ctx.actorLabel,
      reason: parsed.data.action === "revoke" ? parsed.data.reason : null,
      ip: getClientIp(request.headers),
      userAgent: getUserAgent(request.headers),
    });
    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") return apiError("not_found", 404);
    console.error("[api/admin/guardian-links] unexpected", err instanceof Error ? err.message : "unknown");
    return apiError("unexpected", 500);
  }
}
