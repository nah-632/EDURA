# EDURA — findings in detail (run 1)

Full data flows for the six confirmed findings, in severity order. The
machine-readable version (with traces, conditions, payloads and remediation
snippets) is `findings.json`, validated against the skill's schema.

---

## F-01 · HIGH · IDOR via an unscoped booking idempotency key

**Original flow**

```
Attacker (any registered account)
  └─ POST /api/bookings
       {"tutorId":"<public>","studentId":"<own>","subjectCode":"math",
        "lessonTypeCode":"private","method":"online","date":"2026-10-01",
        "time":"17:00","durationMinutes":60,"acceptTerms":true,
        "idempotencyKey":"<tutor id>:2026-10-01:17:00:60"}
        │
        ├─ requireUser()            → OK (attacker's own session)
        ├─ rate limit               → OK
        ├─ createBookingRequest()
        │    └─ findByIdempotencyKey(key)        ← matched by value ONLY
        │         └─ returns the VICTIM's booking row
        └─ 200 { booking: { id, code, status, amount }, whatsappUrl }
```

The ownership check inside the engine (`student.ownerUserId === request.customerUserId`)
never ran, because the idempotency short-circuit returns before it. The leaked
`code` is the same string the customer quotes when sending a BenefitPay proof,
and `amount`/`status` describe another family's booking.

**Fix (three layers)**

1. `SqlBookingStore.findByIdempotencyKey(key, customerUserId)` — SQL now filters
   `and customer_user_id = $2`. A foreign key can never resolve.
2. `BookingStepper` appends a random per-mount suffix to the key, so it cannot be
   constructed by an observer even if a future change ever unscoped the lookup.
3. `tests/booking-idempotency.test.ts` — two accounts, the same key: the second
   must create a NEW booking (and does).

**Why this was reachable:** the key's readable prefix was designed for
"double-tap protection" and nobody asked who else could produce it. The lesson
recorded in the code: an idempotency key is an identifier belonging to one
account, and every lookup by identifier must carry the owner filter.

---

## F-02 · MEDIUM · Implicit `super_admin` for scoped admin accounts

```
loadSession()
  ├─ roles = select code from user_roles …        → e.g. ["support"]
  └─ if (primaryRole === 'admin' && !roles.includes('admin') && !roles.includes('super_admin'))
        roles.push('super_admin')                  ← grants ALL 26 permissions
```

The intent was bootstrap: an administrator created before anybody could grant a
role needs to be able to grant one. The condition, however, also fired for
accounts that WERE scoped — an account whose `primary_role` is `admin` and whose
role row is `support` ended up with `role.manage`, `settings.manage` and
`payment.refund`. Every console page and API route reads `session.permissions`,
so the escalation propagated everywhere with no further check.

**Fix:** the implicit grant requires `roleCodes.length === 0`. Once any role row
exists, the RBAC tables are the authority — which is what the module's own
documentation already claimed.

---

## F-03 · MEDIUM · Deletion without re-authentication

```
POST /api/me {"action":"delete_account","confirm":"delete"}
  → rate limit → deleteOwnAccount(session.user.id)
      ├─ bookings.customer_notes/address_note cleared
      ├─ students anonymised (+ deleted_at)
      ├─ notifications deleted
      ├─ sessions revoked
      └─ users flagged deleted, email/phone anonymised
```

Irreversible, and authorised by a session alone — while the password change on
the same route required the current password. **Fix:** `deleteOwnAccount(userId,
password)` verifies the scrypt hash first and throws `wrong_password` (→ 401)
without touching a row; the client form collects the password and cannot submit
without it.

---

## F-04 · MEDIUM · Cross-account credential stuffing

Bucket `login:<ip>:<lowercased email>` → 10 attempts / 5 minutes. Rotating the
email resets the budget, so a single host could attack every account on the
platform. The account lockout (5 failures per account, doubling to 15 minutes) is
per account and does not stop the sweep. **Fix:** a second budget
`loginPerIp:<ip>` (40 / 5 minutes) is consumed first; both are database-backed so
they hold across serverless instances. The failure mode is unchanged when the
limiter backend is unavailable: reject (fail closed).

---

## F-05 · MEDIUM · Verified payment stranding its booking

```
verifyPayment()
  ├─ payments.status = 'verified'          (transaction 1 — committed)
  ├─ bookings: payment_verification → paid (transaction 2 — could fail)
  └─ retry → 409 already_done             ← no way forward from the console
```

The two writes are sequential and the guard refused the second attempt, so a
transient failure after the first write produced a state that only a manual SQL
statement could clear: the customer paid, the record says so, and the booking is
stuck. **Fix:** verifying is idempotent — the payment row is skipped when it is
already verified, and the booking/subscription follow-up always runs. Illegal
transitions are still refused by the state machine, so a retry cannot
double-apply a status change.

---

## F-06 · LOW · Display name erased by a partial update

`on conflict … do update set display_name = $3` — a form that only edits the full
name sends `displayName` as `undefined`, which the route passes as `null`, so a
stored display name was overwritten with NULL. **Fix:** each column is written
only when the request actually contained the field, with the presence decision
made in SQL (`case when $5::boolean then $2 else user_profiles.full_name end`),
so a future partial caller cannot reintroduce the bug by omission.

---

## Rejected hypotheses (recorded so they are not re-investigated)

1. **SQL injection through the admin catalogue editor.** The table identifier is
   chosen from a map keyed by a zod enum, and every value is a bound parameter.
   No request data reaches an identifier position.
2. **JSON-LD script breakout on the tutor profile / homepage.** Both call sites
   use `serializeJsonLd()`, which escapes `<`, `>`, `&` and the two Unicode line
   separators; a crafted tutor title is serialised inertly.
