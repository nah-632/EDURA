/**
 * Password POLICY (pure) — deliberately separate from password HASHING.
 *
 * The policy is a shared rule: the sign-up form uses it for instant feedback and
 * the server enforces the same function. Hashing, by contrast, needs
 * `node:crypto` and can only ever run on the server.
 *
 * Keeping them in one module is what broke the first production build: the
 * client's AuthForm imported the schema module, which imported the password
 * module, which imported `node:crypto` — and webpack refuses to bundle a Node
 * builtin into a browser chunk. The rule that came out of it: a module reachable
 * from a `"use client"` file may not touch a Node builtin, and the way to hold
 * that line is to split the module, not to loosen the boundary.
 */
export const PASSWORD_MIN_LENGTH = 10;

export interface PasswordPolicyResult {
  ok: boolean;
  reasons: ("too_short" | "needs_upper" | "needs_lower" | "needs_digit" | "too_long")[];
}

export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  const reasons: PasswordPolicyResult["reasons"] = [];
  if (password.length < PASSWORD_MIN_LENGTH) reasons.push("too_short");
  if (password.length > 200) reasons.push("too_long");
  if (!/[A-Z]/.test(password)) reasons.push("needs_upper");
  if (!/[a-z]/.test(password)) reasons.push("needs_lower");
  if (!/[0-9]/.test(password)) reasons.push("needs_digit");
  return { ok: reasons.length === 0, reasons };
}

/** Cheap 0..4 strength score for the sign-up form (never used for policy). */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score++;
  if (password.length >= 14) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
}
