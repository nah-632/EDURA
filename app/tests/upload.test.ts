import test from "node:test";
import assert from "node:assert/strict";

import { UPLOAD_LIMITS, detectImage, extensionFor, validateUpload } from "@/lib/upload/validate";

/** Minimal but structurally real headers - enough for the validators. */
function png(width = 1200, height = 900): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false); // IHDR length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

function jpeg(width = 1600, height = 1200): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
  bytes[4] = 0x00;
  bytes[5] = 0x10; // APP0 segment length 16
  bytes.set([0xff, 0xc0, 0x00, 0x11, 0x08], 20); // SOF0
  bytes[25] = (height >> 8) & 0xff;
  bytes[26] = height & 0xff;
  bytes[27] = (width >> 8) & 0xff;
  bytes[28] = width & 0xff;
  return bytes;
}

function webpVp8x(width = 1000, height = 800): Uint8Array {
  const bytes = new Uint8Array(40);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };
  ascii(0, "RIFF");
  ascii(8, "WEBP");
  ascii(12, "VP8X");
  bytes[24] = (width - 1) & 0xff;
  bytes[25] = ((width - 1) >> 8) & 0xff;
  bytes[26] = ((width - 1) >> 16) & 0xff;
  bytes[27] = (height - 1) & 0xff;
  bytes[28] = ((height - 1) >> 8) & 0xff;
  bytes[29] = ((height - 1) >> 16) & 0xff;
  return bytes;
}

function text(value: string, pad = 0): Uint8Array {
  const body = new TextEncoder().encode(value + " ".repeat(pad));
  return body;
}

test("detects real image types from magic bytes and reads dimensions", () => {
  const p = detectImage(png(1024, 768))!;
  assert.equal(p.mimeType, "image/png");
  assert.deepEqual([p.width, p.height], [1024, 768]);
  const j = detectImage(jpeg(800, 600))!;
  assert.equal(j.mimeType, "image/jpeg");
  assert.deepEqual([j.width, j.height], [800, 600]);
  const w = detectImage(webpVp8x(500, 400))!;
  assert.equal(w.mimeType, "image/webp");
  assert.deepEqual([w.width, w.height], [500, 400]);
  assert.equal(detectImage(text("hello world")), null);
});

test("accepts a valid PNG for a tutor document", () => {
  const res = validateUpload({ bytes: png(), declaredType: "image/png", filename: "degree.png" }, "tutor_document");
  assert.equal(res.ok, true);
  assert.equal(res.mimeType, "image/png");
  assert.equal(res.width, 1200);
});

test("accepts a PDF for documents and proof (bank receipts are often PDF)", () => {
  const pdf = text("%PDF-1.7\n%\u00e2\u00e3\u00cf\u00d3\n1 0 obj\n", 200);
  assert.equal(validateUpload({ bytes: pdf }, "tutor_document").ok, true);
  assert.equal(validateUpload({ bytes: pdf }, "payment_proof").ok, true);
  // anything else is still refused
  assert.equal(validateUpload({ bytes: text("PK\u0003\u0004", 200) }, "payment_proof").ok, false);
});

test("rejects SVG and HTML uploads (stored-XSS vector)", () => {
  for (const payload of [
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    "<!doctype html><html><body>hi</body></html>",
    '<?xml version="1.0"?><svg onload="alert(1)"/>',
    '   <script>alert(1)</script>',
  ]) {
    const res = validateUpload({ bytes: text(payload, 600), declaredType: "image/png" }, "tutor_document");
    assert.equal(res.ok, false, `must reject: ${payload.slice(0, 30)}`);
    assert.equal(res.error, "svg_rejected");
  }
});

test("rejects a file whose declared type contradicts its magic bytes", () => {
  const res = validateUpload({ bytes: png(), declaredType: "image/jpeg" }, "tutor_document");
  assert.equal(res.ok, false);
  assert.equal(res.error, "type_mismatch");
  // image/jpg vs image/jpeg is the one benign aliasing
  assert.equal(validateUpload({ bytes: jpeg(), declaredType: "image/jpg" }, "tutor_document").ok, true);
  assert.equal(validateUpload({ bytes: png(), declaredType: "application/octet-stream" }, "tutor_document").ok, true);
});

test("rejects empty and oversized files", () => {
  assert.equal(validateUpload({ bytes: new Uint8Array(0) }, "tutor_document").error, "empty");
  const big = new Uint8Array(UPLOAD_LIMITS.maxBytes + 1);
  big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  assert.equal(validateUpload({ bytes: big }, "tutor_document").error, "too_large");
});

test("rejects an executable/unsupported payload", () => {
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
  assert.equal(validateUpload({ bytes: zip }, "tutor_document").error, "unsupported_type");
});

test("enforces a minimum long edge for document photos, but not for payment proofs", () => {
  const tiny = png(300, 300);
  assert.equal(validateUpload({ bytes: tiny }, "tutor_document").error, "too_small");
  assert.equal(validateUpload({ bytes: tiny }, "payment_proof").ok, true, "a screenshot may be small");
});

test("rejects a decompression-bomb pixel count", () => {
  const huge = png(20_000, 20_000);
  assert.equal(validateUpload({ bytes: huge }, "tutor_document").error, "too_many_pixels");
});

test("storage extensions are stable", () => {
  assert.equal(extensionFor("image/png"), "png");
  assert.equal(extensionFor("image/jpeg"), "jpg");
  assert.equal(extensionFor("application/pdf"), "pdf");
  assert.equal(extensionFor("application/zip"), "bin");
});
