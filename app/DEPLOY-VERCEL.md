# EDURA — Vercel deployment (5 steps)

This folder is the application: `package.json` is at its root, so a Vercel
"Import Project" or a drag-and-drop of this folder (or of the zip) is detected as
**Next.js** automatically. No build command override is needed
(`npm run build` → `next build`).

---

## 1. Prepare the database (Supabase)

Project Settings → Database → **Connection string**:

| Variable | Which string |
| --- | --- |
| `DATABASE_URL` | *Transaction* pooler, port **6543** (runtime) |
| `DATABASE_URL_DIRECT` | *Session* pooler, port **5432** (migrations) |

Then, from this folder on your machine (or with `npx`):

```bash
npm install
npm run db:migrate        # creates the schema (24 tables, constraints, triggers)
npm run db:seed           # RBAC, subjects, stages, areas, lesson types, plans, settings
ADMIN_BOOTSTRAP_EMAIL=you@example.bh \
ADMIN_BOOTSTRAP_PASSWORD='a-strong-password' \
npm run db:bootstrap-admin
```

`db:bootstrap-admin` prints a TOTP secret and an `otpauth://` URL — add it to an
authenticator app **before** signing in, because admin login requires the code.

## 2. Create the storage buckets (Supabase → Storage)

| Bucket | Public | Purpose |
| --- | --- | --- |
| `edura-public` | yes | tutor avatars, marketing images |
| `edura-private` | **no** | tutor verification documents, payment proofs |

Restrict `edura-private` to the service role. Without the service key the upload
routes answer `501 not_configured` — they never pretend to store a file.

## 3. Import the project into Vercel

`vercel.com → Add New → Project →` either import the Git repository or drag this
folder / the zip in. Framework preset: **Next.js**. Leave build settings default.

## 4. Set the environment variables (Production **and** Preview)

Copy from `.env.example`. Required:

```
DATABASE_URL, DATABASE_URL_DIRECT, DATABASE_POOL_MAX=3,
NEXT_PUBLIC_SITE_URL, WHATSAPP_TARGET, BENEFITPAY_NUMBER,
SUPPORT_EMAIL, SUPPORT_PHONE,
NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
STORAGE_PUBLIC_BUCKET=edura-public, STORAGE_PRIVATE_BUCKET=edura-private,
CRON_SECRET
```

- `NEXT_PUBLIC_SITE_URL` must be the final public origin (canonical links and
  JSON-LD are built from it).
- `DATABASE_POOL_MAX=3` matters: each serverless instance holds its own pool.
- Generate `CRON_SECRET` with e.g. `openssl rand -base64 32`.

`vercel.json` already schedules the reminder job:

```json
{ "crons": [{ "path": "/api/cron/reminders", "schedule": "0 * * * *" }] }
```

Vercel sends `Authorization: Bearer $CRON_SECRET`. Without the secret the route
answers 501 and does nothing — on purpose.

## 5. Verify after the first deploy

1. `/` redirects to `/ar`, and the HTML has `dir="rtl"` and `lang="ar-BH"`.
2. Sign in at `/ar/admin/login` with the bootstrapped account **plus the 6-digit
   code**; the console loads with only your role's modules.
3. Approve a tutor → the profile appears in `/ar/tutors` only with an active
   subscription.
4. Create a booking as a customer → you get a booking code and a WhatsApp deep
   link whose text matches the booking.
5. Upload a tutor document (201), open it from the console → a signed URL is
   returned and a `tutor.document.read` row appears in the audit log.
6. Verify a payment → the payment becomes `verified` **and** the booking reaches
   `paid`, with both entries on the booking timeline.
7. `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/reminders`
   → JSON counters.

**What has not been verified before this deploy:** `next build`, `tsc` and every
query against a live database were impossible in the build environment (no npm
tree, no PostgreSQL). This deployment IS the build gate — see the
project documentation (in `edura-project-full.zip` → `docs/06-testing.md` §3) for the
precise list, and `README.md` here for what WAS verified (131 passing tests, 0
syntax errors, every migration parsed, security audit passed).

## Optional: demo content (staging only)

```bash
npm run db:seed:demo        # clearly labelled demo accounts/tutors/bookings
npm run db:seed:remove-demo # removes it again
```

Never run `db:seed:demo` against production: it creates accounts with published
passwords.
