/**
 * Upload validation - pure and shared between the browser and the server, so
 * the instant client-side feedback runs exactly the code the server enforces.
 *
 * The file type is decided from MAGIC BYTES, never from the declared
 * Content-Type or the extension: a polyglot file that claims to be a PNG while
 * starting with `<svg` or `<script` must not reach storage.
 */
export const UPLOAD_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  imageMinLongEdge: 800,
  imageMaxPixels: 40_000_000,
  docsAllowed: ["image/png", "image/jpeg", "image/webp", "application/pdf"],
  proofsAllowed: ["image/png", "image/jpeg", "image/webp", "application/pdf"],
} as const;

export type UploadKind = "tutor_document" | "payment_proof" | "avatar";

export interface UploadInput {
  bytes: Uint8Array;
  declaredType?: string | null;
  filename?: string | null;
}

export interface UploadResult {
  ok: boolean;
  /** normalised mime type, only present when ok */
  mimeType?: string;
  width?: number;
  height?: number;
  error?: "empty" | "too_large" | "unsupported_type" | "type_mismatch" | "too_small" | "too_many_pixels" | "svg_rejected";
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((b, i) => bytes[i] === b);
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (String.fromCharCode(bytes[offset + i]!).toLowerCase() !== text[i]!.toLowerCase()) return false;
  }
  return true;
}

/** Detect a raster image from its header, and read its dimensions cheaply. */
export function detectImage(
  bytes: Uint8Array,
): { mimeType: "image/png" | "image/jpeg" | "image/webp"; width: number; height: number } | null {
  // PNG
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return { mimeType: "image/png", width, height };
  }
  // JPEG: walk the segment markers to the SOF frame
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = bytes[i + 1]!;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const length = (bytes[i + 2]! << 8) | bytes[i + 3]!;
      const isSof = (marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        const height = (bytes[i + 5]! << 8) | bytes[i + 6]!;
        const width = (bytes[i + 7]! << 8) | bytes[i + 8]!;
        return { mimeType: "image/jpeg", width, height };
      }
      i += 2 + length;
    }
    return null;
  }
  // WebP (RIFF....WEBP) + VP8X/VP8/VP8L dimension parsing
  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP") && bytes.length >= 30) {
    const fourcc = String.fromCharCode(...bytes.slice(12, 16));
    if (fourcc === "VP8X") {
      const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
      const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
      return { mimeType: "image/webp", width, height };
    }
    if (fourcc === "VP8 ") {
      const width = ((bytes[26]! | (bytes[27]! << 8)) & 0x3fff);
      const height = ((bytes[28]! | (bytes[29]! << 8)) & 0x3fff);
      return { mimeType: "image/webp", width, height };
    }
    if (fourcc === "VP8L") {
      const b0 = bytes[21]!;
      const b1 = bytes[22]!;
      const b2 = bytes[23]!;
      const b3 = bytes[24]!;
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { mimeType: "image/webp", width, height };
    }
    return null;
  }
  return null;
}

function looksLikeMarkup(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, 256))
    .trimStart()
    .toLowerCase();
  return head.startsWith("<?xml") || head.startsWith("<svg") || head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<script");
}

export function validateUpload(input: UploadInput, kind: UploadKind): UploadResult {
  const { bytes } = input;
  if (bytes.length === 0) return { ok: false, error: "empty" };
  if (bytes.length > UPLOAD_LIMITS.maxBytes) return { ok: false, error: "too_large" };
  if (looksLikeMarkup(bytes)) return { ok: false, error: "svg_rejected" };

  const allowed: readonly string[] = kind === "tutor_document" ? UPLOAD_LIMITS.docsAllowed : UPLOAD_LIMITS.proofsAllowed;

  const image = detectImage(bytes);
  let mimeType: string | null = image?.mimeType ?? null;
  if (!mimeType && startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) mimeType = "application/pdf";

  if (!mimeType) return { ok: false, error: "unsupported_type" };
  if (!allowed.includes(mimeType)) return { ok: false, error: "unsupported_type" };

  // A declared type that disagrees with the real one is either a bad client or
  // a deliberately disguised file - reject it.
  const declared = input.declaredType?.toLowerCase().trim();
  if (declared && declared !== "application/octet-stream" && declared !== mimeType) {
    // jpg vs jpeg naming is the one benign variation
    const normalised = declared === "image/jpg" ? "image/jpeg" : declared;
    if (normalised !== mimeType) return { ok: false, error: "type_mismatch" };
  }

  if (image) {
    const longEdge = Math.max(image.width, image.height);
    if (kind !== "payment_proof" && longEdge < UPLOAD_LIMITS.imageMinLongEdge) {
      return { ok: false, error: "too_small" };
    }
    if (image.width * image.height > UPLOAD_LIMITS.imageMaxPixels) {
      return { ok: false, error: "too_many_pixels" };
    }
    return { ok: true, mimeType, width: image.width, height: image.height };
  }

  return { ok: true, mimeType };
}

export function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}
