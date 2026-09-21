/**
 * Tutor document service (§21).
 *
 * A tutor's identity documents are the most sensitive data in the platform, so
 * the rules are structural rather than procedural:
 *
 *  - Documents live in a PRIVATE bucket. No code path anywhere returns a public
 *    URL for one.
 *  - The only way to read bytes is `createDocumentAccessLink`, which mints a
 *    short-lived signed URL AND writes an audit row naming the admin, the
 *    document and the tutor. Reading is impossible without leaving a trace.
 *  - The storage path is generated server-side from ids the server owns, so an
 *    uploader cannot choose (or overwrite) a location.
 */
import { randomUUID } from "node:crypto";

import { query, queryOne } from "@/lib/db";
import { storageProvider } from "@/lib/providers";
import { tutorDocumentPath } from "@/lib/providers/storage";
import { auditDocumentAccess, writeAudit } from "@/lib/security/audit";
import { extensionFor, validateUpload } from "@/lib/upload/validate";

export const DOCUMENT_KINDS = ["identity", "degree", "certificate", "experience", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export interface DocumentMeta {
  id: string;
  tutorId: string;
  kind: DocumentKind;
  mimeType: string;
  sizeBytes: number;
  status: "uploaded" | "approved" | "rejected";
  createdAt: Date;
  reviewedAt: Date | null;
}

export interface SaveDocumentParams {
  tutorId: string;
  uploadedBy: string;
  kind: DocumentKind;
  bytes: Uint8Array;
  declaredType?: string | null;
  filename?: string | null;
}

export type SaveDocumentResult =
  | { ok: true; document: DocumentMeta }
  | { ok: false; error: string };

export async function saveTutorDocument(params: SaveDocumentParams): Promise<SaveDocumentResult> {
  const validated = validateUpload(
    { bytes: params.bytes, declaredType: params.declaredType, filename: params.filename },
    "tutor_document",
  );
  if (!validated.ok || !validated.mimeType) {
    return { ok: false, error: validated.error ?? "unsupported_type" };
  }

  // The row is created first so its id can be part of the storage path; if the
  // upload then fails the row is removed, leaving no orphan metadata pointing
  // at bytes that do not exist.
  const inserted = await query<{ id: string }>(
    `insert into tutor_documents (tutor_id, kind, storage_path, mime_type, size_bytes, status)
     values ($1, $2, $3, $4, $5, 'uploaded')
     returning id`,
    [params.tutorId, params.kind, `pending/${randomUUID()}`, validated.mimeType, params.bytes.length],
  );
  const documentId = inserted[0]!.id;
  const path = tutorDocumentPath(params.tutorId, documentId, extensionFor(validated.mimeType));

  try {
    await storageProvider().putPrivate(path, params.bytes, validated.mimeType);
  } catch (err) {
    await query(`delete from tutor_documents where id = $1`, [documentId]);
    throw err;
  }

  await query(`update tutor_documents set storage_path = $2 where id = $1`, [documentId, path]);
  await writeAudit({
    actorUserId: params.uploadedBy,
    actorLabel: null,
    action: "tutor.document.uploaded",
    entity: "tutor_documents",
    entityId: documentId,
    after: { tutor_id: params.tutorId, kind: params.kind, mime_type: validated.mimeType },
  });

  return {
    ok: true,
    document: {
      id: documentId,
      tutorId: params.tutorId,
      kind: params.kind,
      mimeType: validated.mimeType,
      sizeBytes: params.bytes.length,
      status: "uploaded",
      createdAt: new Date(),
      reviewedAt: null,
    },
  };
}

/** Metadata only - never a URL. Safe to render in a list. */
export async function listTutorDocuments(tutorId: string): Promise<DocumentMeta[]> {
  const rows = await query<{
    id: string;
    tutor_id: string;
    kind: DocumentKind;
    mime_type: string;
    size_bytes: number;
    status: DocumentMeta["status"];
    created_at: Date;
    reviewed_at: Date | null;
  }>(
    `select id, tutor_id, kind, mime_type, size_bytes, status, created_at, reviewed_at
       from tutor_documents where tutor_id = $1 order by created_at desc`,
    [tutorId],
  );
  return rows.map((row) => ({
    id: row.id,
    tutorId: row.tutor_id,
    kind: row.kind,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  }));
}

export interface AccessLink {
  url: string;
  expiresAt: Date;
  documentId: string;
  tutorId: string;
  mimeType: string;
}

/**
 * Mint a time-limited link and record the access.
 *
 * The audit row is written BEFORE the URL is handed back: if logging fails the
 * link is not issued, so there is no such thing as an unaudited document read.
 * Five minutes is long enough to open a PDF and short enough that a leaked link
 * is worthless.
 */
export async function createDocumentAccessLink(params: {
  adminUserId: string;
  adminLabel: string;
  documentId: string;
  ip: string | null;
  ttlSeconds?: number;
}): Promise<AccessLink | null> {
  const document = await queryOne<{ id: string; tutor_id: string; storage_path: string; mime_type: string }>(
    `select id, tutor_id, storage_path, mime_type from tutor_documents where id = $1`,
    [params.documentId],
  );
  if (!document) return null;

  const ttl = Math.min(Math.max(params.ttlSeconds ?? 300, 30), 900);
  await auditDocumentAccess({
    adminUserId: params.adminUserId,
    adminLabel: params.adminLabel,
    documentId: document.id,
    tutorId: document.tutor_id,
    ip: params.ip,
  });

  const signed = await storageProvider().signedUrl(document.storage_path, ttl);
  return {
    url: signed.url,
    expiresAt: signed.expiresAt,
    documentId: document.id,
    tutorId: document.tutor_id,
    mimeType: document.mime_type,
  };
}

/** Mark a document reviewed. Rejection requires a reason the tutor will read. */
export async function reviewDocument(params: {
  documentId: string;
  decision: "approved" | "rejected";
  adminUserId: string;
  reason?: string | null;
}): Promise<{ tutorId: string }> {
  const rows = await query<{ tutor_id: string }>(
    `update tutor_documents
        set status = $2, reviewed_by = $3, reviewed_at = now()
      where id = $1
      returning tutor_id`,
    [params.documentId, params.decision, params.adminUserId],
  );
  const row = rows[0];
  if (!row) throw new Error("not_found");
  return { tutorId: row.tutor_id };
}

/**
 * The same rule for payment proofs (§36): a proof that was uploaded to the
 * platform lives in the private bucket, is served through a short-lived signed
 * URL, and the read is audited. Proofs that arrived on WhatsApp have no stored
 * object at all, so there is nothing to sign - the admin sees the recorded note
 * instead, and the console never pretends it has a file it does not have.
 */
export async function createPaymentProofLink(params: {
  adminUserId: string;
  adminLabel: string;
  proofId: string;
  ip: string | null;
  ttlSeconds?: number;
}): Promise<{ url: string; expiresAt: Date; paymentId: string; mimeType: string | null } | null> {
  const proof = await queryOne<{ id: string; payment_id: string; storage_path: string | null; mime_type: string | null }>(
    `select id, payment_id, storage_path, mime_type from payment_proofs where id = $1`,
    [params.proofId],
  );
  if (!proof || !proof.storage_path) return null;

  const ttl = Math.min(Math.max(params.ttlSeconds ?? 300, 30), 900);
  await writeAudit({
    actorUserId: params.adminUserId,
    actorLabel: params.adminLabel,
    action: "payment.proof.read",
    entity: "payment_proofs",
    entityId: proof.id,
    after: { payment_id: proof.payment_id },
    ip: params.ip,
  });

  const signed = await storageProvider().signedUrl(proof.storage_path, ttl);
  return { url: signed.url, expiresAt: signed.expiresAt, paymentId: proof.payment_id, mimeType: proof.mime_type };
}
