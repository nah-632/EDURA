# EDURA — booking, payments, WhatsApp and the guarantee

## 1. Booking state machine

Defined once in `src/lib/booking/state.ts` and enforced for every actor. The
database's exclusion constraint uses a matching list of "slot-holding" statuses,
so the SQL predicate and the TypeScript list must be changed together.

```
pending_payment ──► payment_verification ──► paid ──► confirmed ──► tutor_accepted ──► scheduled ──► in_progress ──► completed
      │                    │                    │            │                │                │              │             │
      │                    └──► pending_payment (proof rejected, retry)      │                │              │             │
      ├──► cancelled (customer/admin/system)   ├──► cancelled/rejected       ├──► rejected    │              │             │
      └──► rejected (admin)                    └──► refund_requested ────────────────────────────────────────────────────────┘
                                                                             refund_requested ──► refunded | completed | cancelled
```

- Customer: `cancelled`, `refund_requested` only.
- Tutor: `tutor_accepted`, `rejected`, `scheduled`, `in_progress`, `completed` only.
- Admin: every edge the machine declares, with a written reason where the
  permission requires one.
- `system` (jobs): `cancelled` from `pending_payment`.

Screens never hard-code which buttons to show: the admin booking detail and the
tutor booking detail both call `allowedTransitions(status, actor)`.

## 2. Conflict prevention (§12, §24) — declared mechanism

Two mechanisms, layered, and they are stated explicitly because the brief asks
for it:

1. **An exclusion constraint** (`bookings_no_tutor_overlap`) is the authority.
   Two simultaneous transactions cannot both insert an overlapping reservation;
   the loser gets SQLSTATE `23P01`, which `SqlBookingStore` maps to
   `SlotTakenError` → HTTP 409 with a translatable code.
2. **An advisory transaction lock per tutor** (`pg_advisory_xact_lock(hashtext(tutor_id))`)
   serialises the "is this slot free" read with the insert, so the common case
   gets a deterministic answer instead of relying on the index to reject one.

Availability itself is checked server-side against weekly windows, time-off
blocks and existing reservations (`lib/booking/availability.ts`); the
customer-facing calendar is a convenience, never the source of truth.

## 3. Pricing

`lib/booking/pricing.ts` works in integer millimes:
`price = ceil(pricePerHour × durationMinutes / 60 × lessonTypeMultiplier)` with
the multiplier and duration coming from `lesson_types` (admin-editable, §10).
The same pure function renders the price on the profile, in the stepper and in
the booking record, so the number a customer sees cannot disagree with the
number they are charged.

## 4. Payment workflow (v1, manual BenefitPay)

```
booking created ──► PENDING_PAYMENT
   │  confirmation page shows: amount, BenefitPay number, booking reference
   │  WhatsApp deep link (built from the booking record) → customer sends
   ▼
customer submits proof ──► payments.status = submitted ──► booking PAYMENT_VERIFICATION
   │  proof is either uploaded (private bucket) or recorded as whatsapp_external
   ▼
admin verifies ──► payments.status = verified (verifier + timestamp recorded)
   │                ──► booking → PAID
   ▼
admin confirms ──► CONFIRMED ──► tutor accepts ──► SCHEDULED ──► … ──► COMPLETED
```

- **No gateway is implemented.** `PaymentProvider` has a v1
  `ManualBenefitPayProvider`; an online gateway is a new implementation of the
  same interface, not a rewrite (§14).
- Refunds are manual too: `payment.refund` permission, written reason, payment
  status `refunded`, and the booking moved by the same state machine.
- A subscription payment follows the identical path and, on verification,
  activates the subscription (extending an active one instead of restarting it).

## 5. WhatsApp handoff (§35)

- Number: platform setting (`whatsappNumber`, default `+973 6666 1238`).
- Message: built from the booking record by `buildWhatsAppMessage()` — booking
  reference, student, tutor, subject, stage, lesson type, method, date, time,
  duration, amount, area, notes — in the reader's language, URL-encoded exactly
  once by `whatsappLink()`.
- The platform **opens** the conversation; the customer presses send. Nothing in
  the product claims a message was delivered, and no WhatsApp API integration is
  pretended.

## 6. Notifications (§17)

| Type | Recipient | Trigger |
| --- | --- | --- |
| `booking.new_request` | tutor | booking created |
| `booking.created` | customer | booking created |
| `payment.submitted` | admins | proof submitted |
| `payment.verified` / `payment.rejected` / `payment.refunded` | customer | admin decision |
| `booking.confirmed` / `cancelled` / `rejected` / `tutor_accepted` / `scheduled` / `completed` | both parties | status change |
| `tutor.approved` / `rejected` / `suspended` / `documents_rejected` | tutor | verification decision |
| `subscription.expiring` / `expired` / `activated` | tutor | expiry job / admin activation |
| `reminder.lesson_24h` / `reminder.lesson_2h` | both parties | reminder job (§18) |
| `review.requested` / `review.published` | customer | completion + delay / moderation |
| `announcement` | audience | admin compose |

Copy is rendered **at read time** in the reader's locale from the type and its
parameters (`lib/notifications/templates.ts`), so a notification created in
Arabic reads correctly in English later. Delivery goes through the
`NotificationProvider` interface; the in-app implementation is the only one live
in v1, and the console shows the others as unconfigured.

## 7. Reminders (§18)

`/api/cron/reminders` (secret-protected) runs two idempotent jobs:

- **Lesson reminders** at 24h and 2h before the lesson, plus a review request
  two hours after completion. Idempotency is per `(booking, type)`: the job reads
  the notification types already written for the booking, so running it twice —
  or from two instances at once — cannot double-send.
- **Subscription expiry**: warn inside the last week (at most once a day), then
  past the grace period mark the subscription `expired` and the tutor
  `expired_subscription`, which removes them from search.

Schedule it from `vercel.json` (see `docs/07-deployment.md`); it works equally
from any external scheduler that can send the secret header.

## 8. Guarantee (addendum §C)

Three claims, and only one of them is configurable — the other two are how the
platform works:

1. **Verification before listing** (not configurable): no profile appears in
   search before an admin approved identity and qualification by hand. Enforced
   by the `public_tutors` view, not by copy.
2. **Payment safety** (not configurable): a booking is never `confirmed` before
   a payment is `verified`, and every verification names its verifier.
3. **Satisfaction / replacement** (configurable in Settings): claim window,
   maximum completed sessions, and the remedy (replacement tutor or credit).
   `lib/guarantee/rules.ts` owns the decision; the policy page, the homepage
   badge and the claim evaluation all read the same numbers, so the published
   promise cannot drift from the enforced rule.

What the guarantee explicitly does **not** cover (stated on the page): exam
results, lessons the student missed without notice, and arrangements made
outside the platform.
