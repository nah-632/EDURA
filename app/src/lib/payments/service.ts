/**
 * Payment records and proofs (§13, §36).
 *
 * v1 takes NO money: the customer pays by BenefitPay outside the platform and
 * sends the proof over WhatsApp. This module records what actually happened,
 * and is deliberately explicit about the difference between the two proof
 * sources:
 *
 *   in_platform        - the customer uploaded a file, stored privately
 *   whatsapp_external  - the proof arrived in a WhatsApp chat; the platform has
 *                        the bytes only because an admin is looking at WhatsApp
 *
 * Nothing here marks a payment verified. Verification is an admin act with a
 * named verifier and a timestamp; the only thing a customer can do is SUBMIT.
 */
import { randomUUID } from "node:crypto";

import { query, queryOne } from "@/lib/db";
import { paymentProofPath } from "@/lib/providers/storage";
import { storageProvider } from "@/lib/providers";
import { notifyMany } from "@/lib/notifications/service";
import { writeAudit } from "@/lib/security/audit";
import { extensionFor, validateUpload } from "@/lib/upload/validate";

/** Payment lifecycle — mirrors the `payment_status` database enum. */
export const paymentStatuses = ["pending", "submitted", "verified", "rejected", "refunded"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export interface PaymentRecord {
  id: string;
  referenceCode: string;
  subjectType: "booking" | "subscription";
  bookingId: string | null;
  subscriptionId: string | null;
  amount: string;
  currency: string;
  method: string;
  status: PaymentStatus;
  customerReference: string | null;
  verifiedAt: Date | null;
  rejectionReason: string | null;
  adminNotes: string | null;
  createdAt: Date;
}

const PAYMENT_COLUMNS = `
  id, reference_code as "referenceCode", subject_type as "subjectType",
  booking_id as "bookingId", subscription_id as "subscriptionId",
  amount, currency, method, status, customer_reference as "customerReference",
  verified_at as "verifiedAt", rejection_reason as "rejectionReason",
  admin_notes as "adminNotes", created_at as "createdAt"
`;

export async function getPayment(paymentId: string): Promise<PaymentRecord | null> {
  return queryOne<PaymentRecord>(`select ${PAYMENT_COLUMNS} from payments where id = $1`, [paymentId]);
}

export async function getPaymentForBooking(bookingId: string): Promise<PaymentRecord | null> {
  return queryOne<PaymentRecord>(
    `select ${PAYMENT_COLUMNS} from payments where booking_id = $1 order by created_at desc limit 1`,
    [bookingId],
  );
}

export async function listPaymentProofs(paymentId: string): Promise<
  { id: string; source: "in_platform" | "whatsapp_external"; mimeType: string | null; receivedNote: string | null; createdAt: Date }[]
> {
  const rows = await query<{
    id: string;
    source: "in_platform" | "whatsapp_external";
    mime_type: string | null;
    received_note: string | null;
    created_at: Date;
  }>(
    `select id, source, mime_type, received_note, created_at
       from payment_proofs where payment_id = $1 order by created_at desc`,
    [paymentId],
  );
  // storage_path is intentionally NOT selected: it must never leave the server.
  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    mimeType: row.mime_type,
    receivedNote: row.received_note,
    createdAt: row.created_at,
  }));
}

/**
 * Who may submit proof for a payment: the account that booked it, or the tutor
 * who requested the subscription. Anyone else gets nothing - not even a
 * different error, so payment ids cannot be probed.
 */
export async function paymentBelongsToUser(paymentId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `select exists (
       select 1 from payments p
        left join bookings b on b.id = p.booking_id
        left join subscriptions s on s.id = p.subscription_id
        left join tutors t on t.id = s.tutor_id
       where p.id = $1
         and (b.customer_user_id = $2 or t.user_id = $2 or p.payer_user_id = $2)
     ) as ok`,
    [paymentId, userId],
  );
  return Boolean(row?.ok);
}

export interface ProofInput {
  source: "in_platform" | "whatsapp_external";
  bytes?: Uint8Array;
  declaredType?: string | null;
  filename?: string | null;
  note?: string | null;
  customerReference?: string | null;
}

export type ProofResult = { ok: true; proofId: string } | { ok: false; error: string };

export async function submitPaymentProof(
  params: { userId: string; paymentId: string; proof: ProofInput },
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ProofResult> {
  const payment = await getPayment(params.paymentId);
  if (!payment) return { ok: false, error: "not_found" };
  if (payment.status === "verified" || payment.status === "refunded") {
    // The money is already reconciled; a late upload must not reopen the record.
    return { ok: false, error: "already_verified" };
  }

  let proofId: string;

  if (params.proof.source === "whatsapp_external") {
    const note = params.proof.note?.trim();
    if (!note) return { ok: false, error: "note_required" };
    const rows = await query<{ id: string }>(
      `insert into payment_proofs (payment_id, source, received_note, uploaded_by)
       values ($1, 'whatsapp_external', $2, $3) returning id`,
      [params.paymentId, note.slice(0, 600), params.userId],
    );
    proofId = rows[0]!.id;
  } else {
    const bytes = params.proof.bytes;
    if (!bytes || bytes.length === 0) return { ok: false, error: "empty" };
    const validated = validateUpload(
      { bytes, declaredType: params.proof.declaredType, filename: params.proof.filename },
      "payment_proof",
    );
    if (!validated.ok || !validated.mimeType) return { ok: false, error: validated.error ?? "unsupported_type" };

    const rows = await query<{ id: string }>(
      `insert into payment_proofs (payment_id, source, storage_path, mime_type, size_bytes, uploaded_by)
       values ($1, 'in_platform', $2, $3, $4, $5) returning id`,
      [params.paymentId, `pending/${randomUUID()}`, validated.mimeType, bytes.length, params.userId],
    );
    proofId = rows[0]!.id;
    const path = paymentProofPath(params.paymentId, proofId, extensionFor(validated.mimeType));
    await storageProvider().putPrivate(path, bytes, validated.mimeType);
    await query(`update payment_proofs set storage_path = $2 where id = $1`, [proofId, path]);
  }

  await query(
    `update payments
        set status = case when status = 'pending' then 'submitted' else status end,
            customer_reference = coalesce($2, customer_reference)
      where id = $1`,
    [params.paymentId, params.proof.customerReference?.trim() || null],
  );

  await writeAudit({
    actorUserId: params.userId,
    actorLabel: null,
    action: "payment.proof_submitted",
    entity: "payments",
    entityId: params.paymentId,
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
    after: { source: params.proof.source, reference_code: payment.referenceCode },
  });

  const admins = await query<{ id: string }>(
    `select u.id from users u
       join user_roles ur on ur.user_id = u.id
       join roles r on r.id = ur.role_id
      where r.code in ('super_admin', 'admin') and u.status = 'active' and u.deleted_at is null`,
  );
  await notifyMany(
    admins.map((a) => a.id),
    "payment.submitted",
    { code: payment.referenceCode },
    { type: "payment", id: payment.id },
  );

  return { ok: true, proofId };
}

/** Admin view: payments with just enough context to decide. */
export interface AdminPaymentRow extends PaymentRecord {
  customerName: string | null;
  tutorName: string | null;
  bookingCode: string | null;
  proofCount: number;
}

export async function listPaymentsForAdmin(filter: {
  /** query-string value, deliberately a string: it may be "all" or any status */
  statusFilter?: string;
  subjectType?: string;
  limit?: number;
}): Promise<AdminPaymentRow[]> {
  const conditions: string[] = ["1 = 1"];
  const params: unknown[] = [];
  if (filter.statusFilter && filter.statusFilter !== "all") {
    params.push(filter.statusFilter);
    conditions.push(`p.status = $${params.length}`);
  }
  if (filter.subjectType && filter.subjectType !== "all") {
    params.push(filter.subjectType);
    conditions.push(`p.subject_type = $${params.length}`);
  }
  params.push(Math.min(Math.max(filter.limit ?? 100, 1), 300));

  const rows = await query<AdminPaymentRow>(
    `select p.id, p.reference_code as "referenceCode", p.subject_type as "subjectType",
            p.booking_id as "bookingId", p.subscription_id as "subscriptionId",
            p.amount, p.currency, p.method, p.status,
            p.customer_reference as "customerReference", p.verified_at as "verifiedAt",
            p.rejection_reason as "rejectionReason", p.admin_notes as "adminNotes",
            p.created_at as "createdAt",
            coalesce(cp.full_name, cp.full_name_ar) as "customerName",
            coalesce(tp.full_name, tp.full_name_ar) as "tutorName",
            b.code as "bookingCode",
            (select count(*)::int from payment_proofs pp where pp.payment_id = p.id) as "proofCount"
       from payments p
       left join bookings b on b.id = p.booking_id
       left join users cu on cu.id = b.customer_user_id
       left join user_profiles cp on cp.user_id = cu.id
       left join subscriptions s on s.id = p.subscription_id
       left join tutors t on t.id = s.tutor_id
       left join users tu on tu.id = t.user_id
       left join user_profiles tp on tp.user_id = tu.id
      where ${conditions.join(" and ")}
      order by p.created_at desc
      limit $${params.length}`,
    params,
  );
  return rows;
}
