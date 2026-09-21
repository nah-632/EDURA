# EDURA — security controls (inventory)

This is the control inventory: what protects what, and where the enforcement
lives. The audit itself, including the six findings and their fixes, is in
`security-audit/run-1/REPORT.md`.

## 1. Authentication

| Control | Implementation |
| --- | --- |
| Password storage | scrypt (N=2¹⁵, r=8, p=1, 64-byte key), 16-byte random salt, self-describing format `scrypt$N$r$p$salt$hash` (`lib/security/password.ts`) |
| Password policy | ≥10 chars, upper + lower + digit, enforced server-side before hashing |
| Timing | Unknown email and wrong password perform the same scrypt comparison |
| Lockout | 5 failures → progressive lock doubling to 15 minutes, stored on the account |
| Admin MFA | TOTP (RFC 4226/6238, ±1 step skew, constant-time compare). `authenticate()` will not return an admin without a valid code; admin sessions live 8 hours |
| Sessions | 256-bit opaque token in an `HttpOnly`, `SameSite=Lax`, `Secure` cookie; only the SHA-256 of the token is stored; DB-backed so revocation is real |
| Revocation | On sign-out, password change, "sign out everywhere", and on suspension/restriction (all sessions revoked in the same transaction) |
| Rate limiting | Database-backed fixed windows (never in-process): login per (address,email) AND per address, registration per IP, booking creation per user, reviews per user, uploads per user. Limiter failure rejects the request |

## 2. Authorization

- **RBAC**: 26 permissions, 4 roles (`super_admin`, `admin`, `moderator`,
  `support`), matrix defined once in `lib/security/rbac.ts` and mirrored into the
  database for joins. The console reports the matrix read-only, because editing it
  at runtime would diverge from the checks the server performs.
- **Every sensitive action is checked server-side**: `requireUser()`,
  `requireTutor()` (tutor resolved FROM the session), `requireAdminApi(permission)`
  (admin + MFA verified + permission + origin). Pages use `adminGate(permission)`
  / `requirePageSession()`.
- **Ownership in SQL**: customer reads filter by the session user id; student
  updates match `owner_user_id`; document/proof access is keyed by the operator's
  permission. There is no route where an id from the request body is trusted as
  the owner.
- **Hiding is not access control**: navigation is filtered by permission for
  presentation, and every page re-checks.

## 3. Input, output and uploads

- **Validation**: Zod schemas on the server for every mutating route; the same
  schemas are reused in the browser for instant feedback, so client and server
  cannot disagree.
- **SQL**: parameterised statements only; the single interpolated identifier is
  chosen from a fixed map, never from request data.
- **Output**: React escapes by default; the only raw HTML is JSON-LD, escaped by
  `serializeJsonLd()`.
- **Uploads** (`lib/upload/validate.ts`, shared client/server): type decided from
  **magic bytes**, declared-type mismatch rejected, SVG/HTML/markup rejected, ≤8 MB,
  pixel-count ceiling, minimum long edge (except payment proofs), storage paths
  generated server-side from server-owned ids.
- **Storage**: tutor documents and payment proofs live in a **private** bucket; the
  only read path mints a ≤15-minute signed URL *after* writing an audit row naming
  the admin. A public URL for a document does not exist anywhere in the system.

## 4. Request-level defences

- `isSameOrigin()` on every state-changing handler (CSRF), relying on the
  `SameSite=Lax` cookie when the `Origin` header is absent (server-to-server calls
  and same-origin form posts).
- `getClientIp()` prefers `x-real-ip` and otherwise takes the LAST
  `x-forwarded-for` entry, so a client-supplied header cannot rotate a rate-limit
  subject. **Requires deployment confirmation** (Vercel edge behaviour).
- API responses carry `no-store`, `nosniff` and `no-referrer`; the HTML app sets
  its own security headers in `next.config.mjs`. The console is `noindex`.
- Error responses carry a stable code only — never a driver message, a SQLSTATE or
  a stack trace.

## 5. Audit and accountability

- Append-only `audit_logs` (a trigger rejects UPDATE/DELETE) recording actor,
  action, entity, reason, before/after, IP and user agent.
- Actions that restrict somebody (reject, suspend, restrict, ban, cancel, refund,
  hide review, reject document) **require a written reason**, enforced by the
  permission matrix rather than by memory.
- Document and payment-proof reads are themselves audited.
- Administrative actions are attributed to a named operator even when the action
  is performed through the provider abstraction (payment verification).

## 6. Data protection

- Account deletion anonymises the profile and the student records, deletes
  notifications, revokes sessions, and retains bookings/payments (financial
  record) with free-text notes and addresses cleared. The explicit plan is
  rendered to the user **before** they confirm (`lib/account/retention.ts`).
- Minor data (student records) is a separate access path: never on a public page,
  shown to a tutor only as far as the lesson needs, covered in the privacy policy
  and flagged in the admin UI.
- Secrets live in environment variables only; no server secret is imported by a
  `"use client"` module; `.env.example` contains no values.
