# EDURA — database

Source of truth: **`drizzle/0000_init.sql`** (schema), `0001_seed_reference.sql`
(reference data), `0002_demo_seed.sql` (demo content, never migrated). There is
no ORM-managed schema: migrations are hand-written SQL that a reviewer can read,
and `src/lib/db/index.ts` runs parameterised statements against them.

## 1. Entities (24 tables + 1 view)

| Group | Tables |
| --- | --- |
| Identity | `users`, `user_profiles`, `sessions`, `rate_limits` |
| Authorization | `roles`, `permissions`, `role_permissions`, `user_roles` |
| Reference | `educational_stages`, `subjects`, `areas`, `lesson_types` |
| Tutors | `tutors`, `tutor_subjects`, `tutor_stages`, `tutor_areas`, `tutor_availability`, `tutor_time_off`, `tutor_documents` |
| Subscriptions | `subscription_plans`, `subscriptions` |
| Bookings | `students`, `bookings`, `booking_items`, `booking_code_counters` |
| Money | `payments`, `payment_proofs` |
| Feedback | `reviews` |
| Messaging | `notifications`, `messages` |
| Platform | `settings`, `audit_logs` |
| View | `public_tutors` (approved + active account + non-lapsed subscription) |

## 2. Constraints that carry business rules

| Rule | Mechanism |
| --- | --- |
| A tutor cannot hold two overlapping reservations | `bookings_no_tutor_overlap`: `EXCLUDE USING gist (tutor_id WITH =, tsrange(starts_at, ends_at) WITH &&) WHERE status IN (…)` |
| Cancelled lessons do not block a slot | the same constraint's partial predicate lists only reservation-holding statuses |
| Booking codes are unique per day and race-free | `next_booking_code(date)` on `booking_code_counters` (an `INSERT … ON CONFLICT … RETURNING`) |
| `starts_at`/`ends_at` cannot be set by a client | trigger `bookings_sync_slot` derives them from date + time + duration |
| One review per booking | unique index on `reviews.booking_id` |
| One booking per idempotency key | partial unique index on `bookings.idempotency_key` |
| Money is never floating point | `numeric(12,3)` for every amount; BHD has three decimals |
| The audit log cannot be edited or deleted | trigger `audit_logs_no_update` raises on UPDATE/DELETE |
| `updated_at` is always accurate | `touch_updated_at` trigger on the 15 mutable tables |
| Every payment has exactly one subject | `CHECK ((subject_type = 'booking') = (booking_id IS NOT NULL))` and the subscription equivalent |
| A stored proof has a path; an external one does not | `CHECK ((source = 'in_platform') = (storage_path IS NOT NULL))` |
| Only a live tutor is publicly listed | the `public_tutors` view (approved, active account, subscription not lapsed) |

## 3. Indexes that exist because of a specific query

`tutors_public_idx` (the listing predicate) · `bookings_tutor_date_idx`
(availability lookup) · `bookings_customer_idx` (customer dashboard) ·
`bookings_status_idx` (admin filters) · `payments_status_idx` /
`payments_booking_idx` (console + booking detail) · `reviews_tutor_idx`
(published reviews per tutor) · `notifications_user_idx` (inbox) ·
`audit_logs_entity_idx` / `audit_logs_actor_idx` (investigation + booking
timeline) · `tutor_availability_tutor_idx` · `tutor_time_off_idx` ·
`tutor_documents_tutor_idx` · `subscriptions_tutor_idx` · `students_owner_idx` ·
`users_role_status_idx`.

## 4. Money and time conventions

- **Currency**: BHD only, `numeric(12,3)`, formatted as `١٢.٥٠٠ د.ب`-style with
  **Latin digits** (`12.500 د.ب` / `BHD 12.500`) — the Gulf convention.
- **Money never touches a float**: the pricing engine works in millimes
  (`lib/booking/pricing.ts`) and PostgreSQL stores `numeric`.
- **Time**: `bookings.starts_at` is a wall-clock `timestamp` in
  `Asia/Bahrain` (so the exclusion constraint compares what a human means by
  "4pm"), and every read that needs an instant converts explicitly with
  `at time zone 'Asia/Bahrain'` (see `lib/reminders/service.ts`). Reading the
  column straight into a JS `Date` would silently apply the server's offset.

## 5. Setting up a database

```bash
npm run db:migrate          # applies drizzle/*.sql (demo files excluded)
npm run db:migrate:status   # what is applied / pending
npm run db:seed             # reference data (idempotent)
npm run db:seed:demo        # development demo content
npm run db:seed:remove-demo # removes every demo row again
```

Use `DATABASE_URL_DIRECT` (session mode, port 5432) for migrations: DDL cannot
complete inside a transaction-mode pooler. The runtime uses the pooled
transaction-mode URL with `DATABASE_POOL_MAX=3`.

## 6. Retention and deletion (§25)

| Data | Kept | Why |
| --- | --- | --- |
| Bookings + payments | 7 years | financial record; a deletion clears the free-text notes and the address, not the money trail |
| Tutor documents | removed 90 days after the relationship ends | verification evidence expires with the relationship |
| Student records (minors) | anonymised on deletion or on the parent's request | the row is kept only so historic bookings still resolve |
| Notifications | deleted with the account | the inbox is the user's, not a financial record |
| Audit log | never deleted | security evidence, contains actor/action, not personal content |

`lib/account/retention.ts` is the single place these numbers are defined, and the
account screen renders the plan from it before asking for confirmation.
