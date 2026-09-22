/**
 * Supabase Storage adapter (REST, no SDK).
 *
 * Two buckets: `edura-public` for tutor avatars, `edura-private` for tutor
 * documents and payment proofs. Private objects are only ever read through a
 * short-lived signed URL (§21) - a permanent public link to a tutor's degree
 * certificate must not exist anywhere in the system.
 *
 * When the service key is absent the provider reports itself unconfigured and
 * every write fails loudly (501 at the route), instead of pretending to store.
 */
import {
  ProviderNotConfiguredError,
  type SignedUrl,
  type StorageProvider,
  type StoredObject,
  type ProviderStatus,
} from "./types";

const PUBLIC_BUCKET = process.env.STORAGE_PUBLIC_BUCKET ?? "edura-public";
const PRIVATE_BUCKET = process.env.STORAGE_PRIVATE_BUCKET ?? "edura-private";

function baseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  return url || null;
}

function serviceKey(): string | null {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ??
    process.env.SUPABASE_SECRET_KEY?.trim() ??
    null;
  return key || null;
}

export class SupabaseStorage implements StorageProvider {
  readonly status: ProviderStatus;

  constructor() {
    const configured = Boolean(baseUrl() && serviceKey());
    this.status = {
      id: "supabase_storage",
      label: "Supabase Storage",
      configured,
      reason: configured
        ? undefined
        : "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing",
    };
  }

  private headers(contentType?: string): HeadersInit {
    const key = serviceKey();
    if (!key) throw new ProviderNotConfiguredError("storage", this.status.reason ?? "no key");
    return {
      Authorization: `Bearer ${key}`,
      apikey: key,
      ...(contentType ? { "Content-Type": contentType } : {}),
    };
  }

  private objectUrl(bucket: string, path: string): string {
    const url = baseUrl();
    if (!url) throw new ProviderNotConfiguredError("storage", "NEXT_PUBLIC_SUPABASE_URL is missing");
    return `${url}/storage/v1/object/${bucket}/${encodeURI(path)}`;
  }

  private async put(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> {
    const res = await fetch(this.objectUrl(bucket, path), {
      method: "POST",
      headers: { ...this.headers(contentType), "x-upsert": "true" },
      // lib.dom's BodyInit no longer accepts `Uint8Array<ArrayBufferLike>`.
      // slice() returns a view over its own ArrayBuffer, which is a BodyInit —
      // no cast, and the bytes are identical.
      body: bytes.slice().buffer,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`storage put failed (${res.status}) ${text.slice(0, 200)}`);
    }
    return { path };
  }

  async putPublic(path: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> {
    const stored = await this.put(PUBLIC_BUCKET, path, bytes, contentType);
    const url = baseUrl();
    return { ...stored, url: `${url}/storage/v1/object/public/${PUBLIC_BUCKET}/${path}` };
  }

  async putPrivate(path: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> {
    return this.put(PRIVATE_BUCKET, path, bytes, contentType);
  }

  async signedUrl(path: string, expiresInSeconds: number): Promise<SignedUrl> {
    const url = baseUrl();
    if (!url) throw new ProviderNotConfiguredError("storage", "NEXT_PUBLIC_SUPABASE_URL is missing");
    const res = await fetch(`${url}/storage/v1/object/sign/${PRIVATE_BUCKET}/${encodeURI(path)}`, {
      method: "POST",
      headers: this.headers("application/json"),
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    });
    if (!res.ok) {
      throw new Error(`storage sign failed (${res.status})`);
    }
    const body = (await res.json()) as { signedURL?: string; signedUrl?: string };
    const signed = body.signedURL ?? body.signedUrl;
    if (!signed) throw new Error("storage sign returned no url");
    // The API returns a path-relative signed URL in some versions.
    const absolute = signed.startsWith("http") ? signed : `${url}/storage/v1${signed}`;
    return { url: absolute, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
  }

  async remove(path: string, bucket: "public" | "private" = "private"): Promise<void> {
    const name = bucket === "public" ? PUBLIC_BUCKET : PRIVATE_BUCKET;
    const res = await fetch(`${baseUrl()}/storage/v1/object/${name}/${encodeURI(path)}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`storage delete failed (${res.status})`);
    }
  }
}

/**
 * Storage path builders. Paths are ALWAYS generated on the server from
 * identifiers the server controls, so a client can never choose where its
 * bytes land (or overwrite someone else's object).
 */
export function tutorDocumentPath(tutorId: string, documentId: string, extension: string): string {
  return `tutors/${tutorId}/documents/${documentId}.${extension}`;
}

export function paymentProofPath(paymentId: string, proofId: string, extension: string): string {
  return `payments/${paymentId}/proofs/${proofId}.${extension}`;
}

export function avatarPath(userId: string, extension: string): string {
  return `avatars/${userId}.${extension}`;
}
