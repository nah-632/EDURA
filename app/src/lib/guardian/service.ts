/**
 * Guardian links (slice A+K).
 *
 * An explicit, verified relationship between a minor student and the account
 * that acts as their guardian, with the guardian's consent captured at link
 * creation (A) and a server-side gate on bookings for minors (K).
 *
 * Enforcement lives in TWO layers on purpose:
 *   1. the booking engine refuses before anything is written (clean API error),
 *   2. the 0004 trigger refuses the INSERT inside SQL (fail closed) even if a
 *      future code path forgets to call this module.
 *
 * The strict flag is DATA, not config: `settings.key='platform'
 * ->> guardianEnforcementStrict`. Grace period = flag off; every booking made
 * under the grace period for an unverified minor is audited.
 */
import { query, queryOne } from "@/lib/db";
import { writeAudit } from "@/lib/security/audit";

export type GuardianLinkStatus = "verified" | "pending" | "none";

export interface GuardianConsentMeta {
  ip: string | null;
  userAgent: string | null;
}

/** Resolve the link between one account and one student in a single query. */
export async function guardianLinkStatus(
  studentId: string,
  guardianUserId: string,
): Promise<GuardianLinkStatus> {
  const row = await queryOne<{ status: GuardianLinkStatus }>(
    `select case
              when bool_or(verification_status = 'verified') then 'verified'
              when bool_or(verification_status = 'pending') then 'pending'
              else 'none'
            end as status
       from guardian_links
      where student_id = $1 and guardian_user_id = $2
        and verification_status in ('pending', 'verified')`,
    [studentId, guardianUserId],
  );
  return row?.status ?? "none";
}

/**
 * Create (or revive) the self_declared link between an account and a student
 * it owns. Called when a minor record is created so the link ALWAYS exists
 * from the first moment; verification upgrades it later.
 *
 * Idempotent: an existing active link for the pair is left untouched (the
 * partial unique index would reject a duplicate insert anyway).
 */
export async function createGuardianLink(params: {
  guardianUserId: string;
  studentId: string;
  relationshipType?: "father" | "mother" | "legal_guardian" | "other";
  consent: GuardianConsentMeta;
  actorLabel?: string | null;
}): Promise<void> {
  const inserted = await query<{ id: string }>(
    `insert into guardian_links
       (guardian_user_id, student_id, relationship_type, verification_status,
        verification_method, consent_granted_at, consent_ip, consent_user_agent)
     values ($1, $2, $3::guardian_relationship, 'pending', 'self_declared', now(), $4, $5)
     on conflict do nothing
     returning id`,
    [
      params.guardianUserId,
      params.studentId,
      params.relationshipType ?? "other",
      params.consent.ip,
      params.consent.userAgent?.slice(0, 300) ?? null,
    ],
  );
  if (!inserted[0]) return; // already linked — nothing to log
  await writeAudit({
    actorUserId: params.guardianUserId,
    actorLabel: params.actorLabel ?? null,
    action: "guardian.link.created",
    entity: "guardian_links",
    entityId: inserted[0].id,
    after: {
      student_id: params.studentId,
      verification_status: "pending",
      verification_method: "self_declared",
    },
    ip: params.consent.ip,
    userAgent: params.consent.userAgent,
  });
}

/**
 * Admin decision on a link. Verify upgrades the method to admin_manual (the
 * operator is the proof); revoke keeps the row (financial/audit history) and
 * frees the pair for a fresh link via the partial unique index.
 */
export async function applyGuardianLinkDecision(params: {
  linkId: string;
  decision: "verify" | "revoke";
  adminUserId: string;
  adminLabel: string;
  reason?: string | null;
  ip: string | null;
  userAgent: string | null;
}): Promise<{ studentId: string; status: string }> {
  const link = await queryOne<{ id: string; student_id: string; verification_status: string }>(
    `select id, student_id, verification_status::text as verification_status
       from guardian_links where id = $1`,
    [params.linkId],
  );
  if (!link) throw new Error("not_found");

  const rows =
    params.decision === "verify"
      ? await query<{ student_id: string }>(
          `update guardian_links
              set verification_status = 'verified', verification_method = 'admin_manual',
                  verified_at = now(), verified_by = $2, updated_at = now()
            where id = $1
            returning student_id`,
          [params.linkId, params.adminUserId],
        )
      : await query<{ student_id: string }>(
          `update guardian_links
              set verification_status = 'revoked', revoked_at = now(), revoked_by = $2,
                  revoke_reason = $3, updated_at = now()
            where id = $1
            returning student_id`,
          [params.linkId, params.adminUserId, params.reason ?? null],
        );
  const row = rows[0];
  if (!row) throw new Error("not_found");

  await writeAudit({
    actorUserId: params.adminUserId,
    actorLabel: params.adminLabel,
    action: params.decision === "verify" ? "guardian.link.verified" : "guardian.link.revoked",
    entity: "guardian_links",
    entityId: params.linkId,
    reason: params.reason ?? null,
    before: { verification_status: link.verification_status },
    after: { verification_status: params.decision === "verify" ? "verified" : "revoked" },
    ip: params.ip,
    userAgent: params.userAgent,
  });
  return { studentId: row.student_id, status: params.decision === "verify" ? "verified" : "revoked" };
}
