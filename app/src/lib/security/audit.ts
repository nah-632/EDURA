/**
 * Audit trail.
 *
 * Append-only by contract and by database trigger (see 0000_init.sql). Every
 * sensitive action - tutor approval, booking status change, payment
 * verification, subscription change, user suspension, settings change and
 * every tutor-document access (§21) - writes exactly one row through here.
 */
import type { TxClient } from "@/lib/db";
import { query } from "@/lib/db";

export interface AuditEntry {
  actorUserId: string | null;
  /** Human-readable actor, used for bootstrap accounts with no users row. */
  actorLabel: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  await query(
    `insert into audit_logs
       (actor_user_id, actor_label, action, entity, entity_id, reason, before, after, ip, user_agent)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      entry.actorUserId,
      entry.actorLabel,
      entry.action,
      entry.entity,
      entry.entityId,
      entry.reason ?? null,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      entry.ip ?? null,
      entry.userAgent ?? null,
    ],
  );
}

/** Same write, inside an existing transaction (used by multi-step actions). */
export async function writeAuditTx(tx: TxClient, entry: AuditEntry): Promise<void> {
  await tx.query(
    `insert into audit_logs
       (actor_user_id, actor_label, action, entity, entity_id, reason, before, after, ip, user_agent)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      entry.actorUserId,
      entry.actorLabel,
      entry.action,
      entry.entity,
      entry.entityId,
      entry.reason ?? null,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      entry.ip ?? null,
      entry.userAgent ?? null,
    ],
  );
}

/**
 * Document access logging (§21): reading a tutor document is itself an audited
 * event, with the document id and the tutor it belongs to.
 */
export async function auditDocumentAccess(params: {
  adminUserId: string;
  adminLabel: string;
  documentId: string;
  tutorId: string;
  ip: string | null;
}): Promise<void> {
  await writeAudit({
    actorUserId: params.adminUserId,
    actorLabel: params.adminLabel,
    action: "tutor.document.read",
    entity: "tutor_documents",
    entityId: params.documentId,
    reason: null,
    after: { tutor_id: params.tutorId },
    ip: params.ip,
  });
}
