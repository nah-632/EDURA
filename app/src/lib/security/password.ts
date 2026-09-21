import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import {
  PASSWORD_MIN_LENGTH,
  checkPasswordPolicy,
  passwordStrength,
  type PasswordPolicyResult,
} from "./password-policy";

/**
 * Password HASHING — server only, because it needs `node:crypto`.
 *
 * The policy half of this concern lives in `password-policy.ts` (pure, no Node
 * builtins) so the sign-up form can share it without dragging a builtin into the
 * browser bundle. Both halves are re-exported from here for existing callers.
 */
const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

const PARAMS = { N: 1 << 15, r: 8, p: 1 };
const KEYLEN = 64;
const SALT_BYTES = 16;
// scrypt needs ~128*N*r bytes plus headroom; the default 32MB cap is too small.
const MAXMEM = 128 * PARAMS.N * PARAMS.r * 2;

export { PASSWORD_MIN_LENGTH, checkPasswordPolicy, passwordStrength };
export type { PasswordPolicyResult };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { ...PARAMS, maxmem: MAXMEM });
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  let derived: Buffer;
  try {
    derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: 128 * N * r * 2,
    });
  } catch {
    return false;
  }
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

