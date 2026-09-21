# EDURA — security audit, run 1

**Target:** `/var/minis/shared/edura/app` (Next.js 15 App Router, TypeScript, PostgreSQL)
**Run:** 1 · no prior runs exist for this repository, so coverage improves with a
second run (each run reaches different code paths).
**Date:** 2026-09-20
**Method:** source-first audit of every authorization boundary, every SQL
statement, both upload paths, the payment/status workflows and the client
surfaces, followed by fixing what was confirmed and re-running the test suite.
**Validation:** `findings.json` passes the skill's own validator
(`PASS: 8 findings valid`).

## Summary

| Severity | Count | Status |
| --- | --- | --- |
| Critical | 0 | — |
| High | 1 | fixed in this run |
| Medium | 4 | fixed in this run |
| Low | 1 | fixed in this run |
| Rejected | 2 | no defect |

**Nothing exploitable remains open from this run.** Both rejected findings were
attempted hypotheses that the code already defends against (statement in the
report, not a silent skip).

The single **HIGH** finding is the one that mattered: an unscoped idempotency-key
lookup turned a convenience feature into a cross-account booking disclosure. It
was reachable by any registered user and the key was derivable from public data.

## What was found

### F-01 · HIGH · IDOR: booking idempotency key resolved across accounts
`POST /api/bookings` short-circuits on `idempotencyKey` before any ownership
work, and `findByIdempotencyKey` matched by value only. The shipped client
derives the key as `<tutorId>:<date>:<time>:<duration>` — all public — so a
second account could send a foreign key and receive that customer's booking
object (`code`, which is also the BenefitPay reference, plus amount and status)
with HTTP 200. **Fixed** in three layers: the SQL lookup is scoped by
`customer_user_id`, the client key carries an unguessable random suffix, and
`tests/booking-idempotency.test.ts` pins the behaviour down.

### F-02 · MEDIUM · Implicit `super_admin` for scoped admin accounts
`loadSession()` granted `super_admin` whenever an `admin`-primary_role account's
role rows did not contain `admin` — including when they contained `support` or
`moderator`, i.e. exactly the accounts that were meant to be scoped. With
`session.permissions` as the input to every guard, the escalation silently
defeated the RBAC model. **Fixed:** the implicit grant now applies only when the
account has no role rows at all (the true bootstrap case).

### F-03 · MEDIUM · Account deletion authorized by a session alone
`POST /api/me {action:'delete_account'}` anonymised the profile, scrubbed student
records and disabled the account with only a session cookie — while the password
change in the same route required the current password. **Fixed:** the deletion
now verifies the password (401 on failure), and the confirmation word remains as
a second step.

### F-04 · MEDIUM · Login limited per (address, email), not per address
Rotating the email address produced a fresh budget, so one machine could attack
unlimited accounts. **Fixed:** a second, address-only budget (40 per 5 minutes)
is applied before the per-pair budget; both live in the database so they hold
across serverless instances.

### F-05 · MEDIUM · Verified payment could strand its booking
`verifyPayment()` marked the payment verified and then advanced the booking in a
second transaction; if that follow-up failed, the retry answered `already_done`
and the paid booking could not be advanced from the console. **Fixed:**
verification is now idempotent — the payment row is skipped when already
verified, and the follow-up always runs.

### F-06 · LOW · Partial profile update erased the display name
`updateOwnProfile` assigned `display_name = $3` unconditionally, so a form that
only edited the full name wrote NULL over a stored display name. **Fixed:** each
field is written only when it was present in the request (decided in SQL with
explicit presence flags).

## What was verified clean (and how)

| Area | Evidence |
| --- | --- |
| SQL injection | Every statement in `src/lib/**` and `src/app/api/**` uses bound parameters. The only interpolated identifiers are a fixed column list and a whitelist map (`CATALOG_TABLES`) keyed by a zod enum. No `sql.raw`, no identifier interpolation from request data. |
| Stored XSS | No `dangerouslySetInnerHTML` outside JSON-LD, which goes through `serializeJsonLd()` (escapes `<`, `>`, `&`, U+2028/29). Review/announcement text is rendered as React text nodes. |
| CSRF | Every mutating handler calls `isSameOrigin()`; the session cookie is `HttpOnly` + `SameSite=Lax` and no route enables CORS. |
| Access control | Customer queries are filtered by the session user id in SQL (bookings, students, notifications, payments); tutor routes resolve the tutor from the session, never from a parameter; admin routes go through `requireAdminApi(permission)` with MFA verified. |
| File upload | Type from magic bytes (not Content-Type/extension), declared-type mismatch rejected, SVG/HTML/markup rejected, size and pixel ceilings, storage paths generated server-side, documents and proofs in a private bucket only. |
| Private object access | The only read path is a signed URL (max 15 min) minted after an audit row is written; storage paths are never returned to a client. |
| Rate-limit fail mode | The limiter is consulted before the work and a limiter error rejects the request (fail closed). |
| Secrets | No server secret is imported by a `"use client"` module (all `process.env` reads are in server-only modules); `.env.example` carries no values. |
| Audit integrity | `audit_logs` is append-only by database trigger; the console has no update/delete path. |
| Session handling | Opaque 256-bit token, only its SHA-256 stored, DB-backed revocation on sign-out/password change/suspension, 8-hour admin sessions. |
| Admin MFA | `authenticate()` refuses to return an admin without a valid TOTP code; `requireAdminApi` additionally requires `mfaVerified` on the session. |

## Hardening notes (not vulnerabilities)

1. **TOCTOU between reading and writing a booking status.** `transitionBooking()`
   and the admin path read the current status, assert the transition in memory,
   then update inside a transaction that locks the row — but the assertion is not
   re-evaluated under that lock. Two simultaneous legal transitions could both
   commit, and the last writer wins. Effects are benign (the rows are legal
   states; the audit trail records both), and re-asserting inside the lock is a
   small future change.
2. **`GET /api/admin/documents/:id` writes an audit row.** It is a GET with a
   side effect. Cross-site triggering is harmless (a cross-origin caller cannot
   read the response, and the effect is an audit entry naming the admin whose
   session was used), but a POST would be more conventional.
3. **Booking → payment coupling across two transactions.** The same shape as
   F-05 exists between booking creation and its payment row: a failure between
   them leaves a booking without a payment record. It needs no customer-visible
   recovery path today because the payment row is created immediately after, but
   a single-transaction version is the cleaner end state.
4. **Requires deployment testing (not confirmed here): `X-Forwarded-For`
   handling.** `getClientIp()` prefers `x-real-ip` and otherwise takes the LAST
   entry of `x-forwarded-for`, which is correct for Vercel's edge. The actual
   header behaviour of the deployed platform cannot be verified from the build
   environment, so it is stated as a post-deploy check rather than a finding.

## Coverage and limits of this run

- No live deployment was audited: this is a source-first review plus executable
  tests. Anything that depends on the hosting edge, TLS configuration, DNS or
  header rewriting is explicitly out of scope here.
- The database was not reachable from the build environment, so SQL behaviour was
  verified by reading the statements and by parsing every migration with sqlglot
  — not by running them. Two schema-level suspicions were dropped for that
  reason rather than reported as findings.
- A second run focused on business logic (booking/refund abuse, subscription
  bypass by timing) and on the tutor-facing surfaces is the recommended next
  step.
