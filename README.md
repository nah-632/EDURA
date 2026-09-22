# EDURA — إدورا

A bilingual (Arabic RTL / English LTR) private-tutoring marketplace for Bahrain.
Families find and book verified private tutors; qualified Bahraini education
specialists get a structured channel for teaching work.

**Brand kit v2** — the dhow whose bow is a pen nib, on turquoise / terracotta /
sand / pearl. See `docs/10-brand-kit-v2.md`.

---

## Repository layout

```
app/                 ← the Next.js application (THIS is the Vercel root)
  src/               pages, components, lib
  drizzle/           hand-written SQL migrations + seeds
  public/            fonts, brand assets, manifest
  scripts/           migrate / seed / bootstrap-admin / design gates
  tests/             131 tests
  .env.example       every variable, documented
brand/               logo, lockups, icons, and the scripts that generate them
docs/                01…10 — architecture, database, security, deployment, brand
spec/                the original requirements
security-audit/      findings and what was done about them
scripts/             brand + SQL tooling (Python)
```

### ⚠️ Deploying to Vercel — two settings that will bite you

1. **Root Directory = `app`.** The Next project is a subdirectory, not the repo
   root. Vercel will otherwise try to build the repository root and fail.
2. **Add every variable from `app/.env.example`** in
   Vercel → Project → Settings → Environment Variables. The app does not carry
   defaults for any of them; a missing `DATABASE_URL` means every data page
   answers 500.

Full walkthrough: **`docs/07-deployment.md`** — start at section 0
("Readiness status"), which lists exactly what is verified and what is not.

### Scheduled reminders

`vercel.json` registers an hourly cron at `/api/cron/reminders`, authenticated
with `CRON_SECRET`. **The hourly schedule requires Vercel Pro** — on Hobby,
cron runs at most once a day.

---

## Running it locally

```bash
cd app
npm install
npm run dev            # http://localhost:3000
```

### Database

```bash
npm run db:migrate        # apply drizzle/*.sql, tracked in schema_migrations
npm run db:seed           # reference data + RBAC
npm run db:bootstrap-admin  # first admin, with TOTP; needs ADMIN_BOOTSTRAP_*
```

Use Supabase's **pooler** connection strings. The direct
`db.<ref>.supabase.co` host is IPv6-only and will not work from serverless:

| variable | which string |
| --- | --- |
| `DATABASE_URL` | Supavisor **transaction** pooler, port **6543** |
| `DATABASE_URL_DIRECT` | Supavisor **session** pooler, port **5432** — migrations only |

The scripts read `.env.local` themselves; deployments take the values from the
environment.

## Quality gates

```bash
cd app
npm run check:syntax     # esbuild over src/**
npm test                 # 131 tests, one process per file
npm run check:css        # tailwind + cssnano, the same chain next build uses
npm run check:contrast   # WCAG AA over the token palette (21 pairs)
npm run check:imports    # resolves every route's full import graph
npm run check:client     # no server-only module reaches a client bundle
npm run check:row-types  # status columns are never typed as bare strings
npm run check:fields     # form field literals match the FormField union
```

## Brand

```bash
cd app && npm run brand:all   # mark → lockups → assets → fonts
```

Regenerates every logo and icon from the supplied brand board. The generator
scripts are committed; the intermediate trace masks are not.

---

## Licence and legal

Source is private. The Terms, Privacy, Guarantee and related policy text in the
application are **drafts and require review by a Bahrain-licensed legal advisor
before publication** — the CMS supports a `LEGAL_REVIEW_REQUIRED` state for
exactly this reason.
