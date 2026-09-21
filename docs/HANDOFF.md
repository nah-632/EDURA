# EDURA — session handoff

## State: the platform is BUILT and re-skinned to brand kit v2.

**2026-09-21 — brand kit v2 applied.** The client supplied the real brand
presentation board (dhow + pen-nib mark, turquoise/terracotta/sand/graphite,
Poppins + Amani Kufi, "Your Path to Educational Success"). It supersedes the v1
navy/blue identity. Full record, including the conflict register that justifies
the decision, the measurements, the Amani Kufi substitution and the two visual
defects that only appeared in the rendered preview: **`docs/10-brand-kit-v2.md`**.
v1 assets are archived under `brand/v1/` — nothing was deleted.
The client also removed the mark's four-sparkle cluster (same doc, §4).

What remains is deployment configuration.

Root: `/var/minis/shared/edura/` → `app/` (Next.js project), `spec/`, `brand/`,
`scripts/`, `docs/`, `security-audit/`, `assets-build/`.

### Read these first
1. `app/README.md` — what exists, how to run it, what is verified.
2. `docs/01-architecture.md` … `docs/08-skills-log.md` — architecture, database,
   workflows, security controls, localisation, testing, deployment, skills.
3. `docs/10-brand-kit-v2.md` — the brand kit, its measurements and the
   defects the visual QA caught. Read this before touching any colour or font.
4. `security-audit/run-1/REPORT.md` — the audit, including what was fixed.
5. `spec/EDURA-MASTER-PROMPT.txt` + `spec/EDURA-ADDENDUM-ABOUT-PRIVACY-GUARANTEE.md`
   — the authoritative requirements (do NOT ask the user to re-attach them).

### What is built (all on disk)
- **Public**: home (hero + Bahraini badge, About teaser, guarantee badges, FAQ,
  JSON-LD), tutors search + profile + booking stepper, booking confirmation
  (`/[locale]/booking/[code]`) with the WhatsApp + BenefitPay handoff, pricing,
  how, about, rules, contact, legal (terms, privacy incl. cookies/PDPL sections,
  guarantee, cancellation, refund, safety, tutor-terms).
- **Customer area**: overview, bookings list + detail (cancel, refund request,
  review form, proof recording), students CRUD, notifications, account (profile,
  preferences, password, sessions, retention plan, deletion with re-auth).
- **Tutor area**: dashboard (visibility, counts, earnings, subscription), profile
  editor, availability + time off, document upload, subscription incl. plan
  request, booking requests/details (accept, decline, progress, meeting link).
- **Admin console** (15 screens): overview/KPIs/14-day chart, tutors + detail
  (documents, subscription activation, edit), users + detail (restrict, suspend,
  roles), bookings + detail (state-machine-driven status buttons, payment,
  timeline), payments (verify/reject/refund), reviews (moderation), notifications
  (composer + provider status), catalog, lesson types, plans, settings (incl.
  guarantee terms), CMS (hero/about/guarantee copy), roles (read-only by design),
  audit log. Admin sign-in with mandatory TOTP.
- **API**: auth, bookings, reviews, payments/proof, `me/*`, `tutor/*`,
  `admin/*` (11 resources), `cron/reminders`.
- **Data**: `drizzle/0000_init.sql` (schema), `0001_seed_reference.sql`,
  `0002_demo_seed.sql` + `drizzle/dev/demo_seed_remove.sql`.
- **Ops**: `scripts/migrate.mjs`, `scripts/seed-reference.mjs`,
  `scripts/bootstrap-admin.mjs` (bundles the app's own password/TOTP modules),
  `vercel.json` (cron), `.env.example`.

### Verification actually performed in this environment
- `npm run check:syntax` (esbuild over `src/**`): 0 errors.
- `npm test`: **131/131 pass** (15 files). The runner is now
  `scripts/run-tests.mjs`, one node process per file — a single process for the
  whole suite SIGSEGVs at random here, which made crashes indistinguishable from
  regressions.
- `npm run check:contrast`: **21/21** WCAG pairs (new with v2).
- Visual QA against the real compiled stylesheet at 390 px, AR + EN.
- `python3 ../scripts/validate_sql.py`: 114 + 21 statements parsed, 0 failures.
- `impeccable detect`: 0 anti-patterns (3 found and fixed).
- security-audit: 8 findings validated, 6 confirmed and fixed (1 HIGH, 4 MEDIUM,
  1 LOW), 2 rejected.

### NOT verified anywhere (do not claim otherwise)
`next build`, `next dev`, `tsc --noEmit`, any query against a real database, and
any browser end-to-end run. **Vercel is the build gate**; the post-deploy
checklist is `docs/06-testing.md` §3 and `docs/07-deployment.md` §5.

### Outstanding from the operator
`DATABASE_URL` / `DATABASE_URL_DIRECT` · `SUPABASE_SERVICE_ROLE_KEY` + the two
storage buckets · `ADMIN_BOOTSTRAP_*` (then delete them) · `CRON_SECRET` ·
`NEXT_PUBLIC_SITE_URL` · legal review of the Terms/Privacy/Guarantee wording.

## Environment rules that bit us (do not relearn)
1. **Never rely on a screenshot as durable context.** `/var/minis/{workspace,
   browser,attachments,offloads}` are session-scoped and wiped when a new session
   starts. Write facts to files under `/var/minis/shared/<project>/`.
2. **`npm install` does not complete here** for the full Next tree (a targeted
   install of TypeScript + zod + React types DID work in ~45 s and lives in
   `/tmp/deps`). So: no `tsc`, no `next build` locally. Use esbuild for syntax and
   the bundled test loop.
3. **Test loop without a dependency tree:** `npm test` (bundles, then runs one
   process per file via `scripts/run-tests.mjs`). To bundle only:
   ```bash
   npm run test:bundle   # has the mandatory --alias:pg=./src/preview/stubs/pg.js
   ```
   The `pg` alias is required — without it the bundle fails to resolve `pg`.
   Do NOT go back to `node --test .tmp-tests/*.js` in one process: it SIGSEGVs.
4. **esbuild one file at a time is slow** (~2-3 s each): batch it
   (`esbuild $(find src -name '*.ts' -o -name '*.tsx') --outdir=/tmp/check`) or
   the command will exceed the tool timeout.
5. Long, screenshot-heavy sessions brick themselves (see the memory entry from
   2026-09-20); start a new session at phase boundaries and keep the state in
   files.
