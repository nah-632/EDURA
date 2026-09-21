# EDURA — architecture

## 1. Shape of the system

```
Browser
  │
  ├── /[locale]/…            server components (pages) ──┐
  ├── /api/…                 route handlers ─────────────┤
  │                                                      ▼
  │                                        src/lib/* (domain layer)
  │                                          • booking engine + state machine
  │                                          • availability / pricing
  │                                          • payments, reviews, subscriptions,
  │                                            notifications, reminders, guarantee
  │                                          • security: session, RBAC, TOTP,
  │                                            rate limiting, audit
  │                                                      │
  │                                                      ▼
  │                                     providers (interfaces, §14)
  │                                       payment │ notification │ email
  │                                       whatsapp │ video │ storage
  │                                                      │
  └───────────────────────────────────────────► PostgreSQL (Supabase)
                                                  + Storage (private bucket)
```

Three rules make the codebase navigable:

1. **Pages and routes own I/O; `src/lib` owns decisions.** A page renders, a
   route validates and authorizes, and the domain logic sits in `src/lib`, where
   it is testable without a database.
2. **Providers are interfaces.** Payment, notification, email, WhatsApp, video
   and storage are consumed through `src/lib/providers/types.ts`. v1 ships the
   manual implementations; a future integration replaces the implementation, not
   the callers.
3. **The database is the last word.** Booking conflicts, booking codes, audit
   immutability and rating aggregates are enforced in SQL (constraints,
   sequences, triggers) so application bugs cannot corrupt them.

## 2. Where a request is authorized

| Surface | Entry point | Guard |
| --- | --- | --- |
| Customer API | `/api/me/*`, `/api/bookings`, `/api/reviews`, `/api/payments/proof` | `requireUser()` — session only |
| Tutor API | `/api/tutor/*` | `requireTutor()` — session AND the tutor row is resolved from the session user |
| Admin API | `/api/admin/*` | `requireAdminApi(permission)` — admin session, MFA verified, permission checked, origin checked |
| Admin pages | `/[locale]/admin/*` | `adminGate(permission)` per page (the layout is chrome only) |
| Customer pages | `/[locale]/dashboard/*` | `requirePageSession()` in the layout **and** per page |
| Tutor pages | `/[locale]/tutor/*` | `requirePageSession({ requireTutor: true })` |
| Cron | `/api/cron/reminders` | `CRON_SECRET` (constant-time compare); 501 when unset |

Every guard returns a discriminated union (`{ ok: true } | { ok: false, reason }`)
so a caller cannot proceed past a failed check by accident.

## 3. Data flow of a booking (the critical path)

1. `POST /api/bookings` — origin check → session → rate limit → Zod → reference
   codes resolved server-side (the client never sends ids for reference data).
2. `createBookingRequest()` (`lib/booking/engine.ts`) checks, in order: idempotency
   key, tutor bookable (approved + subscription active), subject/stage/method
   offered, lesson type active, **student ownership**, then availability
   (`checkAvailability`: weekly windows, time-off, existing bookings, lead time,
   advance limit, duration).
3. `SqlBookingStore.insertBooking()` runs one transaction: advisory lock on the
   tutor → `next_booking_code()` (per-day SQL sequence) → insert booking →
   insert line item. The exclusion constraint rejects a colliding slot with
   SQLSTATE 23P01, which the store converts to `SlotTakenError` → HTTP 409.
4. A payment row is created, both parties are notified, and the route returns
   the booking plus a WhatsApp deep link built from the record it just wrote.

## 4. Rendering and caching

- Marketing pages: `revalidate = 30` (public, cacheable) — live tutor data comes
  from the database, not from fixtures.
- Authenticated areas: `force-dynamic` everywhere. A cached dashboard would show
  one account another account's data.
- Legal pages: `revalidate = 3600`.
- `/[locale]/layout.tsx` IS the root layout: it owns `<html lang dir>`, so the
  document direction is correct in the first byte of HTML (no RTL flash).

## 5. Failure behaviour

| Failure | Behaviour |
| --- | --- |
| Database not configured | Public pages fall back to the labelled demo fixtures; authenticated screens and the console show "database not configured" — never zeros dressed as analytics |
| Storage not configured | Upload routes answer 501 `not_configured`; nothing pretends to store a file |
| Email/WhatsApp/SMS not wired | The admin console lists them as *not configured* from the provider registry |
| Rate-limit backend down | Requests are rejected (fail closed), not allowed through |
| Cron secret missing | The job endpoint answers 501 and does nothing |

## 6. Deliberate deviations from a literal reading of the brief

| Point | Decision | Why |
| --- | --- | --- |
| Fonts (§4) | The client's brand kit names Poppins + Open Sans (Latin) and Amani Kufi (Arabic); that kit supersedes the first logo file. Body = Open Sans + Noto Kufi Arabic, display = Poppins + Reem Kufi | Amani Kufi is commercial and cannot be self-hosted, so the closest freely licensed Kufi pair substitutes for it. Two registers let the marketplace keep a display voice without decorating dashboards. Recorded in `docs/10-brand-kit-v2.md` |
| Next.js version | 15.0.3 pinned with React 18 | The npm tree cannot be resolved in the build environment; the pinned pair is the one the code was written against |
| "Run these skills" (§34) | Applied where they exist in this environment; each one recorded in `docs/08-skills-log.md`, including the ones that could not run and what was done instead | Claiming a skill ran when it did not would be a lie in the deliverable |
