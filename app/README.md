# EDURA — منصة الدروس الخصوصية في البحرين

Bilingual (Arabic-first, RTL) tutoring marketplace for the Kingdom of Bahrain:
families find a verified private tutor, book a lesson, pay by **BenefitPay** with
a WhatsApp handoff, and a tutor gets a real income channel — with the platform
running discovery, verification, scheduling, payment verification and follow-up.

- **Tagline:** المعلم المناسب… مستقبل أفضل / *The right tutor. A brighter future.*
- **Brand line:** منصة بحرينية بفخر / *Proudly Bahraini.*

---

## 1. What is in this repository

| Area | Contents |
| --- | --- |
| `src/app/[locale]` | Public pages (home, tutors, booking, about, pricing, legal, contact), the customer dashboard, the tutor dashboard, the admin console, and the admin sign-in |
| `src/app/api` | Route handlers: auth, bookings, payments, reviews, `me/*`, `tutor/*`, `admin/*`, `cron/reminders` |
| `src/lib` | Domain logic: booking engine + state machine, availability, pricing, WhatsApp handoff, security (session, password, RBAC, TOTP, rate limit, audit, JSON-LD), providers (payment/notification/email/WhatsApp/video/storage), notifications, reviews, subscriptions, reminders, guarantee, retention, i18n |
| `drizzle/` | Hand-written SQL migrations (`0000_init`), reference seed (`0001`), demo seed (`0002`, clearly labelled), demo removal (`dev/`) |
| `tests/` | Executable test suite (bundled with esbuild, run with `node --test`) |
| `scripts/` | Migration runner, seed runner, first-admin bootstrap |
| `docs/` | Architecture, database, workflows, security, localisation, testing, deployment, skills log |

## 2. Stack

Next.js 15 (App Router) · React 18 · TypeScript 5.6 (strict, `noUncheckedIndexedAccess`) ·
Tailwind 3.4 (tokens live in `src/styles/globals.css`) · PostgreSQL (Supabase) via `pg` ·
Zod validation · scrypt passwords + TOTP MFA · Supabase Storage (private bucket,
signed URLs) · no payment gateway in v1 (manual BenefitPay by design, §13).

## 3. Getting started

```bash
npm install
cp .env.example .env.local          # fill in DATABASE_URL / DATABASE_URL_DIRECT
npm run db:migrate                  # schema
npm run db:seed                     # reference data (RBAC, catalogue, plans, settings)
npm run db:seed:demo                # optional demo content (development only)
ADMIN_BOOTSTRAP_EMAIL=you@example.bh ADMIN_BOOTSTRAP_PASSWORD='…' npm run db:bootstrap-admin
npm run dev
```

`npm run db:seed:remove-demo` removes every demo row again (the demo seed prints
its own credentials; they are development-only and must never reach production).

## 4. Verification you can run here

```bash
npm run check:syntax      # parses every module (no dependency tree needed)
npm test                  # bundles and runs the test suite (131 assertions)
python3 ../scripts/validate_sql.py      # parses every migration with sqlglot
```

**What could not be run in the build environment, and therefore is not claimed:**
`next build`, `tsc --noEmit` and `next dev` require the full npm dependency tree
(Next + SWC), which this environment cannot install; no PostgreSQL server is
available either, so migrations were validated by parsing rather than applying.
**Vercel is the build gate** and the first deployment is a required step — see
`docs/06-testing.md` for exactly what was verified and how.

## 5. Product rules worth knowing before changing code

- **Booking state machine** (`src/lib/booking/state.ts`) is the single definition
  of legal status transitions, per actor (customer / tutor / admin / system).
  Customer and tutor screens generate their buttons *from it*, and the admin
  console does the same — so a new legal edge appears everywhere at once.
- **Conflict prevention is in the database**, not in application code: an
  exclusion constraint on `(tutor_id, tsrange(starts_at, ends_at))` for
  slot-holding statuses, plus an advisory lock per tutor for a deterministic
  answer instead of a race.
- **Payment is manual by design**: booking → WhatsApp handoff → BenefitPay →
  proof → admin verification → `paid`. No gateway is implemented, and no screen
  claims otherwise.
- **WhatsApp**: the platform builds a deep link from the booking record and the
  customer presses send. It never claims to have delivered a message.
- **Subscription gates listing**: only `approved` tutors with an active (or
  in-grace) subscription appear in `public_tutors`.
- **Guarantee terms are configuration** (`settings` → guarantee fields), read by
  the published policy page, the homepage badge and the claim rule alike.
- **Minor data** (student records) is a separate access path: never on a public
  page, anonymised on account deletion.

## 6. Security posture (summary)

Server-side authorization on every sensitive action, DB-backed sessions with
hashed tokens, admin sessions that require TOTP, RBAC with 26 permissions,
reason-required audit rows for every restricting action, rate limits in the
database (not in memory), private storage with audited five-minute signed URLs,
origin checks on state-changing requests, no secrets in client code, and an
append-only audit log enforced by a database trigger. Full detail, including the
findings and their fixes: `security-audit/run-1/REPORT.md`.

## 7. Deployment (short version)

Vercel + Supabase (Postgres, Storage) + Vercel Cron for `/api/cron/reminders`.
Long version, including the exact environment variables, bucket setup, the
reminder schedule and the post-deploy checklist: `docs/07-deployment.md`.

## 8. What still needs an operator

1. `DATABASE_URL` / `DATABASE_URL_DIRECT` (Supabase → Database → Connection string).
2. `SUPABASE_SERVICE_ROLE_KEY` and the two storage buckets (`edura-public`,
   `edura-private`) — without them uploads return 501 rather than pretending.
3. `ADMIN_BOOTSTRAP_*` to create the first administrator (TOTP is mandatory).
4. `CRON_SECRET` before enabling the reminder job.
5. Legal review of the Terms / Privacy / Guarantee wording by a Bahrain-licensed
   advisor — the pages say so in place, and nothing claims compliance.
6. Replace the demo content (if seeded) and confirm `NEXT_PUBLIC_SITE_URL`.
