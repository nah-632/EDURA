/**
 * TOTP (RFC 6238) with the RFC 4226 HOTP core - mandatory for admin accounts
 * (§15). Base32 secrets are decoded before keying the HMAC, which is what every
 * authenticator app does; a mismatch there would lock admins out permanently.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += B32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = B32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`invalid base32 character: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

/** HOTP value for a counter (RFC 4226). */
export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter % 2 ** 32, 4);
  const mac = createHmac("sha1", secret).update(buf).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const code =
    ((mac[offset]! & 0x7f) << 24) |
    ((mac[offset + 1]! & 0xff) << 16) |
    ((mac[offset + 2]! & 0xff) << 8) |
    (mac[offset + 3]! & 0xff);
  return String(code % 10 ** digits).padStart(digits, "0");
}

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function totp(secret: string, at: Date = new Date(), step = TOTP_STEP_SECONDS): string {
  const counter = Math.floor(at.getTime() / 1000 / step);
  return hotp(base32Decode(secret), counter, TOTP_DIGITS);
}

/**
 * Verify a code allowing ±1 step of clock skew, in constant time.
 * An empty/missing secret always fails rather than matching by accident.
 */
export function verifyTotp(
  secret: string | null | undefined,
  code: string,
  at: Date = new Date(),
  window = 1,
): boolean {
  if (!secret) return false;
  const cleaned = code.replace(/\D/g, "");
  if (cleaned.length !== TOTP_DIGITS) return false;
  let secretBuf: Buffer;
  try {
    secretBuf = base32Decode(secret);
  } catch {
    return false;
  }
  if (secretBuf.length === 0) return false;
  const counter = Math.floor(at.getTime() / 1000 / TOTP_STEP_SECONDS);
  let match = false;
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = hotp(secretBuf, counter + offset, TOTP_DIGITS);
    const a = Buffer.from(candidate, "utf8");
    const b = Buffer.from(cleaned, "utf8");
    if (a.length === b.length && timingSafeEqual(a, b)) match = true;
  }
  return match;
}

/** otpauth:// URI for the QR code shown during admin MFA setup. */
export function totpUri(secret: string, accountLabel: string, issuer = "Edura"): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}
