# EDURA — deployment

Target: **Vercel** (application) + **Supabase** (PostgreSQL + Storage) +
**Vercel Cron** (reminders). Everything below is a real step; nothing in this
document is a placeholder.

## 0. Readiness status — read this first (2026-09-21)

### What is verified

Every gate that can run without a network build passes:

| Gate | Result |
| --- | --- |
| `npm run check:syntax` | 0 errors across `src/**` |
| `npm test` | **131 / 131** (15 files) |
| `npm run check:css` | tailwind 128,824 B → cssnano 96,719 B |
| `npm run check:contrast` | 21 / 21 WCAG AA pairs |
| `npm run check:imports` | 140 entry points resolved |
| `npm run check:client` | 18 client modules bundle |
| `npm run check:row-types` | clean |
| Next 15 async API audit | 68 `params`/`cookies`/`headers` call sites, 0 unawaited |
| Visual QA | real components + real compiled CSS at 390 px, AR and EN |

### What is NOT verified anywhere

`next build`, `tsc --noEmit`, any query against a live database, any browser
end-to-end run. **Vercel is the build gate.** The first deployment is where a
TypeScript or Next-specific build error would surface for the first time.

### Database — DONE (2026-09-21)

Live and verified against the real Supabase project:

* `DATABASE_URL` = Supavisor **transaction** pooler, port 6543, IPv4.
* `DATABASE_URL_DIRECT` = Supavisor **session** pooler, port 5432 — migrations only.
* Both written to `app/.env.local` (chmod 600, gitignored). **Rotate the password
  first** — it was pasted into a chat, so it is not a secret any more.
* The direct host `db.<ref>.supabase.co` was **not** used: Supabase now makes it
  IPv6-only and Vercel functions cannot reach it. This is the single most common
  cause of "it works locally, not on Vercel".
* `npm run db:migrate` applied `0000_init.sql` + `0001_seed_reference.sql` →
  **33 tables**. `0002_demo_seed.sql` is deliberately excluded from the runner.
* Verified through **the application's own data layer**, not a side script:
  `listSubjects` 11 · `listStages` 3 · `listAreas` 14 · `listPlans` 2 ·
  bound parameters · `withTransaction` round-trip · and the §20 concurrency
  guarantee `bookings_no_tutor_overlap` (GiST `EXCLUDE` over
  `tsrange(starts_at, ends_at)` restricted to the seven active statuses).
* RBAC seeded: 4 roles, 26 permissions, 68 role-permission rows.

One caveat observed once in five runs: the **first** query after the pooler
goes cold can fail with an unmapped `database_error`. It did not reproduce in
three consecutive repeats. Watch it after deploy.

### Admin — DONE (2026-09-21)

`npm run db:bootstrap-admin` created the first administrator: status `active`,
`mfa_enabled = true`, assigned to `super_admin` (all 26 permissions), with
`primary_role = 'admin'`. Both are set on purpose — `primary_role` is the coarse
shortcut the UI counts, `user_roles` is what the RBAC matrix checks.

The TOTP secret and its QR are in `secrets/admin-totp.txt` (0600) and
`workspace/edura-admin-totp.png`. Sign in at `/ar/admin/login`.

**Two secrets were reused in the supplied values and must not stay that way.**
`CRON_SECRET` arrived equal to the admin password; it has been replaced with a
generated 32-byte value (`secrets/vercel-env.txt`). A cron token travels in an
`Authorization` header on every scheduled call and must never share a trust
boundary with a human login. The admin password itself is 11 characters with a
guessable shape and should be changed on first sign-in.

### Hard blockers that remain — all configuration, none code
2. `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the two buckets
   (`edura-public`, `edura-private`). Without them uploads answer 501 by design.
   Blank in `secrets/vercel-env.txt`, waiting on Supabase → Project Settings → API.
3. `NEXT_PUBLIC_SITE_URL` — canonical URLs and JSON-LD.
4. `CRON_SECRET` — `/api/cron/reminders` answers 501 without it.
5. The same database values, copied into Vercel → Settings → Environment
   Variables. `.env.local` does not exist in a deployment.

### Mechanics that have caught people out

* **Vercel → Root Directory must be `app`.** The Next project is a subdirectory
  of the repository, not the repository root.
* **The project is not a git repository here.** Push it to GitHub first, or
  deploy with `vercel` from `app/`.
* **There is no lockfile.** `npm install` runs on Vercel; generate and commit a
  `package-lock.json` from a normal machine for a reproducible build.
* **The hourly cron needs Vercel Pro.** Hobby allows cron, but on a daily
  schedule only — `0 * * * *` will not fire there. Either move to Pro or switch
  the schedule and accept daily reminders.
* `EDURA_HASH_FUNCTION=sha256` exists only as an escape hatch for runtimes
  without WebAssembly. **Do not set it on Vercel.**

## 1. Database

1. Create the Supabase project (region closest to Bahrain — any EU/Asia region
   works; latency is dominated by the pooler hop, not the distance).
2. Project Settings → Database → **Connection string**:
   - *Transaction* pooler (:6543) → `DATABASE_URL` (runtime).
   - *Session* pooler (:5432) → `DATABASE_URL_DIRECT` (migrations/DDL).
3. Locally, with those two variables set:

```bash
npm run db:migrate            # schema + reference data
npm run db:seed               # RBAC, catalogue, lesson types, plans, settings
ADMIN_BOOTSTRAP_EMAIL=… ADMIN_BOOTSTRAP_PASSWORD='…' npm run db:bootstrap-admin
```

The bootstrap prints a TOTP secret and an `otpauth://` URL. Add it to an
authenticator app **before** signing in — admin login requires the code.

Optional, for a preview/staging deployment only:

```bash
npm run db:seed:demo          # clearly labelled demo content (see README §8)
npm run db:seed:remove-demo   # removes it again
```

## 2. Storage

Supabase → Storage → create two buckets:

| Bucket | Public | Contents |
| --- | --- | --- |
| `edura-public` | yes | tutor avatars and marketing assets |
| `edura-private` | **no** | tutor verification documents, payment proofs |

Restrict `edura-private` to the service role (no anon read), and keep the bucket
MIME allowlist to images + PDF. Then set `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` in the deployment environment. **Without them the
upload routes answer 501** rather than pretending to store a file.

## 3. Vercel

1. Import the repository; framework preset Next.js; build `npm run build`.
2. Environment variables (Production + Preview), from `.env.example`:
   `DATABASE_URL`, `DATABASE_URL_DIRECT`, `DATABASE_POOL_MAX=3`,
   `NEXT_PUBLIC_SITE_URL`, `WHATSAPP_TARGET`, `BENEFITPAY_NUMBER`,
   `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_PUBLIC_BUCKET`, `STORAGE_PRIVATE_BUCKET`,
   `CRON_SECRET`.
3. `NEXT_PUBLIC_SITE_URL` must be the final public origin: canonical links,
   `alternates` and JSON-LD are built from it.

## 4. Scheduled reminders

`vercel.json` in the repository root already declares the schedule:

```json
{
  "crons": [{ "path": "/api/cron/reminders", "schedule": "0 * * * *" }]
}
```

Vercel sends `Authorization: Bearer $CRON_SECRET`; the route also accepts an
`x-cron-secret` header, so any external scheduler can drive it. Without
`CRON_SECRET` the endpoint answers 501 and does nothing — deliberately, because a
job endpoint that silently succeeds unauthenticated would be both a
vulnerability and a lie about whether reminders are running.

## 5. Post-deploy checklist

Run these against the deployed instance, in order:

1. `GET /api/health` (or the homepage) returns 200 and the HTML has `dir="rtl"`
   and `lang="ar-BH"`.
2. Sign in as the bootstrapped admin with a TOTP code; `/ar/admin` loads and the
   navigation shows only the modules the role may open.
3. Approve a tutor, then confirm the profile appears in `/ar/tutors` **only**
   with an active subscription.
4. Create a booking as a customer; the response contains a `code` and a WhatsApp
   deep link whose text matches the booking.
5. Upload a document as a tutor (201), then open it from the console: a signed
   URL is returned and a `tutor.document.read` row appears in the audit log.
6. Verify a payment in the console: the payment becomes `verified` **and** the
   booking advances to `paid`, with both writes visible on the booking timeline.
7. `curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/reminders`
   returns a JSON body with reminder and subscription counters.
8. Confirm `getClientIp()` resolves real addresses from the edge (check the IP
   recorded on a login audit row) — audit hardening note 4.
9. Load the console on a phone; the tables scroll horizontally and no layout
   breaks (the console is a data surface, not a shrunk desktop page).

## 6. Rollback and operations

- **Application**: Vercel's instant rollback to the previous deployment.
- **Schema**: migrations are append-only SQL applied in name order and recorded
  in `schema_migrations`; write a forward migration rather than editing an
  applied one. `npm run db:migrate:status` lists applied vs pending.
- **Data**: `npm run db:seed` is idempotent, so re-running it after an operator
  edit does not overwrite their catalogue. Removing demo data is one command.
- **Secrets**: rotate `CRON_SECRET` and the Supabase service role from the
  hosting dashboard; the application reads them at request time, so no redeploy
  is needed beyond the environment change.
