import test from "node:test";
import assert from "node:assert/strict";

import {
  PASSWORD_MIN_LENGTH,
  checkPasswordPolicy,
  hashPassword,
  passwordStrength,
  verifyPassword,
} from "@/lib/security/password";
import {
  clearSessionCookie,
  createSessionToken,
  hashSessionToken,
  isLocked,
  lockoutFor,
  parseCookieHeader,
  serializeSessionCookie,
  safeEqualHex,
  sessionExpiry,
} from "@/lib/security/session";
import { base32Decode, base32Encode, generateTotpSecret, hotp, totp, totpUri, verifyTotp } from "@/lib/security/totp";
import { MemoryRateLimiter, bucketKey } from "@/lib/security/ratelimit";
import { faqJsonLd, serializeJsonLd, tutorJsonLd } from "@/lib/security/jsonld";
import { permissionsFor, requiresReason } from "@/lib/security/rbac";

// ---------------------------------------------------------------------------
test("passwords hash with scrypt and verify without storing the plaintext", async () => {
  const hash = await hashPassword("Bahrain2026Secure");
  assert.ok(hash.startsWith("scrypt$"));
  assert.ok(!hash.includes("Bahrain2026"));
  assert.equal(await verifyPassword("Bahrain2026Secure", hash), true);
  assert.equal(await verifyPassword("Bahrain2026Secure ", hash), false);
  assert.equal(await verifyPassword("wrong", hash), false);
  assert.equal(await verifyPassword("x", "not-a-hash"), false);
  assert.equal(await verifyPassword("x", "scrypt$0$0$0$AA==$AA=="), false);
});

test("two hashes of the same password differ (per-password salt)", async () => {
  const [a, b] = await Promise.all([hashPassword("SamePassword1"), hashPassword("SamePassword1")]);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("SamePassword1", a), true);
  assert.equal(await verifyPassword("SamePassword1", b), true);
});

test("the password policy is enforced server-side", () => {
  assert.equal(checkPasswordPolicy("short1A").ok, false);
  assert.equal(checkPasswordPolicy("alllowercase1").ok, false);
  assert.equal(checkPasswordPolicy("ALLUPPERCASE1").ok, false);
  assert.equal(checkPasswordPolicy("NoDigitsHere").ok, false);
  assert.equal(checkPasswordPolicy("GoodPassword1").ok, true);
  assert.equal(PASSWORD_MIN_LENGTH, 10);
  assert.equal(passwordStrength("GoodPassword1"), 2, "no symbol, so not top strength");
  assert.equal(passwordStrength("GoodPassword1!"), 4);
});

// ---------------------------------------------------------------------------
test("session tokens are random and only their hash is stored", () => {
  const a = createSessionToken();
  const b = createSessionToken();
  assert.notEqual(a.token, b.token);
  assert.equal(a.hash, hashSessionToken(a.token));
  assert.notEqual(a.hash, a.token);
  assert.equal(a.hash.length, 64);
  assert.ok(safeEqualHex(a.hash, a.hash));
  assert.ok(!safeEqualHex(a.hash, b.hash));
  assert.ok(!safeEqualHex(a.hash, ""));
});

test("session cookies are HttpOnly, SameSite=Lax and Secure in production", () => {
  const cookie = serializeSessionCookie("tok", { maxAge: 100, secure: true });
  assert.ok(cookie.includes("HttpOnly"));
  assert.ok(cookie.includes("SameSite=Lax"));
  assert.ok(cookie.includes("Secure"));
  assert.ok(cookie.startsWith("edura_session=tok;"));
  assert.ok(!cookie.includes("Domain"));
  const local = serializeSessionCookie("tok", { maxAge: 100, secure: false });
  assert.ok(!local.includes("Secure"));
  assert.ok(clearSessionCookie().includes("Max-Age=0"));
});

test("cookie parsing decodes values and ignores junk", () => {
  const parsed = parseCookieHeader("a=1; edura_session=abc%3Ddef; ; b=2");
  assert.equal(parsed.edura_session, "abc=def");
  assert.equal(parsed.a, "1");
  assert.deepEqual(parseCookieHeader(null), {});
});

test("admin sessions are much shorter than customer sessions", () => {
  const now = new Date("2026-09-20T00:00:00Z");
  const user = sessionExpiry("user", now);
  const admin = sessionExpiry("admin", now);
  assert.ok(admin.getTime() < user.getTime());
  assert.equal((admin.getTime() - now.getTime()) / 3_600_000, 8);
});

test("progressive lockout kicks in after repeated failures", () => {
  assert.deepEqual(lockoutFor(0), { lockedUntil: null, nextCount: 1 });
  const fifth = lockoutFor(4);
  assert.ok(fifth.lockedUntil, "the 5th failure locks the account");
  assert.equal(isLocked(fifth.lockedUntil), true);
  const sixth = lockoutFor(5);
  assert.ok(sixth.lockedUntil!.getTime() > fifth.lockedUntil!.getTime(), "lock length grows");
  assert.equal(isLocked(null), false);
  assert.equal(isLocked(new Date(Date.now() - 1000)), false);
});

// ---------------------------------------------------------------------------
// RFC 6238 / RFC 4226 vectors: passing these means a real authenticator app
// and this server agree on the same code.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "utf8"));

test("RFC 4226 HOTP test vectors", () => {
  const secret = Buffer.from("12345678901234567890", "utf8");
  const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  for (let counter = 0; counter < expected.length; counter += 1) {
    assert.equal(hotp(secret, counter), expected[counter], `counter ${counter}`);
  }
});

test("RFC 6238 TOTP test vectors (6-digit truncation)", () => {
  const vectors: [number, string][] = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ];
  for (const [seconds, code] of vectors) {
    const at = new Date(seconds * 1000);
    assert.equal(totp(RFC_SECRET, at), code, `t=${seconds}`);
    assert.equal(verifyTotp(RFC_SECRET, code, at), true);
    assert.equal(verifyTotp(RFC_SECRET, code, new Date((seconds + 3600) * 1000)), false);
  }
});

test("TOTP tolerates one step of clock skew and nothing more", () => {
  const at = new Date(1_600_000_000_000);
  const code = totp(RFC_SECRET, at);
  assert.equal(verifyTotp(RFC_SECRET, code, new Date(at.getTime() + 29_000)), true);
  assert.equal(verifyTotp(RFC_SECRET, code, new Date(at.getTime() - 29_000)), true);
  assert.equal(verifyTotp(RFC_SECRET, code, new Date(at.getTime() + 91_000)), false);
  assert.equal(verifyTotp(null, code, at), false);
  assert.equal(verifyTotp("", code, at), false);
  assert.equal(verifyTotp(RFC_SECRET, "000000", at), false, "wrong code must not pass");
  assert.equal(verifyTotp(RFC_SECRET, "12345", at), false, "malformed code must not pass");
  assert.equal(verifyTotp("!!!!", code, at), false, "invalid base32 must not throw or pass");
});

test("base32 round-trips and produces a usable otpauth URI", () => {
  const raw = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x01]);
  assert.deepEqual(base32Decode(base32Encode(raw)), raw);
  assert.throws(() => base32Decode("0189"));
  const secret = generateTotpSecret();
  assert.equal(secret.length, 32);
  const uri = totpUri(secret, "admin@edura.bh");
  assert.ok(uri.startsWith("otpauth://totp/Edura%3Aadmin%40edura.bh?"));
  assert.ok(uri.includes(`secret=${secret}`));
  assert.ok(uri.includes("period=30"));
});

// ---------------------------------------------------------------------------
test("the rate limiter stops a burst and recovers in the next window", async () => {
  let now = new Date("2026-09-20T10:00:00Z");
  const limiter = new MemoryRateLimiter(() => now);
  for (let i = 1; i <= 10; i += 1) {
    const res = await limiter.hit("login:1.2.3.4", 10, 300);
    assert.equal(res.allowed, true, `hit ${i} should pass`);
    assert.equal(res.remaining, 10 - i);
  }
  const blocked = await limiter.hit("login:1.2.3.4", 10, 300);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  now = new Date("2026-09-20T10:06:00Z");
  const fresh = await limiter.hit("login:1.2.3.4", 10, 300);
  assert.equal(fresh.allowed, true, "a new window resets the counter");
});

test("rate-limit buckets are normalised so casing cannot evade a limit", () => {
  assert.equal(bucketKey("login", " Person@Example.com "), "login:person@example.com");
});

// ---------------------------------------------------------------------------
test("JSON-LD output cannot break out of the script element", () => {
  const payload = { name: `</script><script>alert(1)</script>`, note: "a & b" };
  const out = serializeJsonLd(payload);
  assert.ok(!out.includes("</script>"));
  assert.ok(!out.includes("<script>"));
  assert.ok(out.includes("\\u003c"));
  assert.ok(out.includes("\\u0026"));
  // it must still be valid JSON that parses back to the original values
  assert.deepEqual(JSON.parse(out), payload);
});

test("tutor, FAQ JSON-LD carry the expected schema.org shape", () => {
  const person = JSON.parse(
    tutorJsonLd({
      name: "محمد علي",
      headline: "مدرس رياضيات",
      bio: "…",
      area: "الرفاع",
      ratingAvg: "4.50",
      ratingCount: 12,
      pricePerHour: "6.500",
      currency: "BHD",
      url: "https://edura.bh/ar/tutors/x",
      subjects: ["الرياضيات"],
    }),
  );
  assert.equal(person["@type"], "Person");
  assert.equal(person.address.addressCountry, "BH");
  assert.equal(person.makesOffer.priceCurrency, "BHD");
  assert.equal(person.aggregateRating.reviewCount, 12);
  const faq = JSON.parse(faqJsonLd([{ question: "q", answer: "a" }]));
  assert.equal(faq["@type"], "FAQPage");
  assert.equal(faq.mainEntity[0].acceptedAnswer.text, "a");
});

// ---------------------------------------------------------------------------
test("permission sets come from roles, and sensitive actions need a reason", () => {
  const admin = permissionsFor(["admin"]);
  assert.ok(admin.has("payment.verify"));
  assert.ok(!admin.has("role.manage"), "only super_admin manages roles");
  const moderator = permissionsFor(["moderator"]);
  assert.ok(moderator.has("review.moderate"));
  assert.ok(!moderator.has("payment.verify"), "moderators must not verify money");
  assert.ok(!moderator.has("payment.refund"));
  const support = permissionsFor(["support"]);
  assert.ok(support.has("booking.read"));
  assert.ok(!support.has("booking.update"));
  assert.ok(permissionsFor([]).size === 0);
  assert.equal(requiresReason("tutor.reject"), true);
  assert.equal(requiresReason("tutor.read"), false);
});
