# EDURA — audit architecture summary (input to the hunting phases)

## What the application is

A bilingual (Arabic-first) marketplace for private tutoring in Bahrain. Two
audiences: families booking lessons, and tutors who list themselves under a paid
subscription. Money moves **outside** the platform in v1 (manual BenefitPay with
a WhatsApp handoff) and is reconciled by an admin who verifies a payment proof.

## Trust boundaries

| Boundary | Inside | Outside |
| --- | --- | --- |
| Public → authenticated | marketing pages, tutor directory, legal pages | `/dashboard/*`, `/tutor/*`, `/api/me/*`, `/api/bookings` |
| Authenticated → tutor | customer sessions | `/tutor/*`, `/api/tutor/*` (tutor resolved from the session) |
| Tutor/customer → admin | all user surfaces | `/admin/*`, `/api/admin/*` (admin session + TOTP verified + permission checked) |
| Application → storage | metadata only | object bytes, reachable only through a signed URL minted after an audit write |
| Application → money | a payment RECORD | the actual transfer (BenefitPay app) and the proof (WhatsApp) |
| Automation → platform | `/api/cron/reminders` — the only endpoint that acts for everyone | everything else |

## Entry points worth attacking

`POST /api/bookings` (creates reservations, touches availability and money) ·
`POST /api/auth` (register/login incl. admin MFA path) · `POST /api/me` (profile,
password, session revocation, irreversible account deletion) ·
`POST /api/me/bookings` (cancel / refund request) · `POST /api/reviews` ·
`POST /api/payments/proof` (multipart upload) · `POST /api/tutor/*` (profile,
availability, documents upload, booking decisions) · `POST /api/admin/*`
(11 resources, ~25 actions) · `GET /api/admin/documents/:id` and
`GET /api/admin/payment-proofs/:id` (signed-URL minting) ·
`GET|POST /api/cron/reminders`.

## Data flows with money or identity consequences

1. **Booking**: reference codes resolved server-side → engine checks (tutor
   bookable, student owned, availability) → single transaction (advisory lock,
   per-day code sequence, insert) → exclusion constraint decides races →
   payment row + notifications.
2. **Payment verification**: admin permission check → payment row verified →
   booking advanced through the state machine → both writes audited with the
   acting admin.
3. **Document access**: admin permission check → audit row written first →
   signed URL (≤ 15 min) returned. No permanent URL exists anywhere.
4. **Account deletion**: session → password re-authentication (after run 1) →
   anonymisation of profile + student rows, deletion of notifications, revocation
   of sessions, retention of bookings/payments/audit.
5. **Subscription lifecycle**: request (pending + payment row) → admin
   verification → activation that EXTENDS an active period → expiry job that
   warns, then lapses the subscription and the tutor's listing status.

## Known prior findings (this run)

See `findings.json`: 6 confirmed (1 high, 4 medium, 1 low), all fixed in the same
run, plus 2 rejected hypotheses. The highest-value area for a second run is
business-logic abuse rather than injection or access control, which this run
covered systematically.
