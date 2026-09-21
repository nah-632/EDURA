# EDURA — testing and verification

## 1. What the test suite covers

```bash
npm test        # bundles tests with esbuild, then runs node --test
```

131 assertions across fifteen files. They are behavioural, not smoke tests:

| File | What it pins down |
| --- | --- |
| `booking-engine.test.ts` | 80 simultaneous bids resolve to one coherent reservation; below-increment rejection does not corrupt the leader; idempotency; rate limiting; anti-sniping under load; banned/restricted bidders never win |
| `booking-idempotency.test.ts` | an idempotency key belonging to another account creates a NEW booking instead of disclosing one (regression test for audit finding F-01) |
| `booking-state.test.ts` | the state machine's declared edges, per actor, and that terminal states stay terminal |
| `availability.test.ts` | weekly windows, time-off, lead time, advance limit, duration and slot conflicts |
| `pricing.test.ts` | millime arithmetic, multiplier application, BHD three-decimal behaviour, no float drift |
| `i18n.test.ts` | both dictionaries have identical keys, no duplicates across modules, placeholders match, no Arabic in English values, Latin digits, BHD formatting, date/time in Bahrain time |
| `security.test.ts` | session cookie tampering rejected, money parsing rejects 4-decimals/negative/scientific, JSON-LD escaping neutralises a `</script>` payload |
| `admin-rbac.test.ts` | every role grants only declared permissions, moderator/support limits hold, destructive actions require reasons, every console nav entry maps to a real permission, retention policy shape |
| `notifications.test.ts` | every notification type renders a non-empty title in both languages, English stays English, parameters interpolate without leaving braces, preferences default to enabled, audience predicates exclude suspended accounts |
| `subscriptions.test.ts` | renewal EXTENDS an active period, expiry restarts, grace stays listable, warning window and daily cap |
| `reminders.test.ts` | 24h/2h windows, no double send, late job still delivers, started lessons are left alone, review request waits and fires once |
| `reviews.test.ts` | only the customer of a completed booking reviews it, one review per booking, moderation edges, rating aggregation from published rows only |
| `guarantee.test.ts` | every refusal reason is reachable, the claim window is inclusive at its boundary, remedy follows configuration |

## 2. What was actually verified in the build environment

| Check | Command | Result |
| --- | --- | --- |
| Every module parses | `npm run check:syntax` (esbuild over all `src/**`) | 0 errors |
| Stylesheet compiles **and minifies** | `npm run check:css` (Tailwind + cssnano, the two stages `next build` runs) | tailwind 86,844 B · cssnano 60,968 B, no error |
| Test suite | `npm test` | 131 assertions, 0 failures |
| Migrations and seeds parse | `python3 ../scripts/validate_sql.py` | 114 + 21 statements parsed, 0 failures |
| Admin scripts parse | `node --check scripts/*.mjs` | OK |
| Audit findings schema | `node …/validate-findings.cjs findings.json` | PASS: 8 findings valid |

## 2a. The one build failure that did happen, and its permanent gate

The first Vercel deployment failed in the minifier, not in the application:

```
TypeError: Cannot read properties of undefined (reading 'length')
  at optimise (next/dist/compiled/cssnano-simple/index.js)
  at ValueParser.walk (…/postcss-value-parser/index.js)
```

**Root cause:** `.hero__scrim` and `.band__scrim` used logical direction
keywords inside a gradient — `linear-gradient(to inline-end, …)`. cssnano's
gradient minifier parses the first argument of a gradient to rewrite it as an
angle, and it does not understand `inline-end`, so it walked into a node that was
not there. It was reproduced locally against the real stylesheet
(`postcss` + `cssnano` over the Tailwind-compiled CSS) and it crashed at exactly
the same declaration.

**Fix:** physical keywords plus an explicit direction override — `to right` in
the base rule, `to left` inside `html[dir="rtl"]` — which is both minifier-safe
and unambiguous to read. Both scrims now behave identically in both directions
(the minifier rewrites them to `90deg` / `270deg`).

**Permanent gate:** `npm run check:css` runs the Tailwind compile and the cssnano
minification over the real stylesheet and exits non-zero with a message naming
this class of cause. It is the only local check that can catch a
production-minifier failure, and it is listed in the deployment checklist.

## 3. What could NOT be verified here, stated plainly

- **`next build` / `next dev` never ran.** The npm dependency tree (Next + SWC)
  cannot be installed in this environment; `node_modules` here contains only the
  React runtime used by the static preview harness. **Vercel is the build gate**,
  and the first deployment is a required step.
- **`tsc --noEmit` never ran** for the same reason. Type safety is therefore
  unproven by the compiler; it is supported by `strict` +
  `noUncheckedIndexedAccess` in `tsconfig.json` and by the runtime tests.
- **No page has ever executed as server-rendered HTML** in this environment.
  The first deployment therefore caught a build-stage defect (a minifier crash,
  see §2a) that no local check had covered; that gap is now closed by
  `npm run check:css`.
- **No PostgreSQL was ever reached.** Migrations were parsed with sqlglot rather
  than applied, and no query has been executed against a real schema. Two
  database-level suspicions were dropped from the audit for this reason rather
  than reported as findings.
- **No browser end-to-end run.** The interactive flows (booking stepper, admin
  actions, uploads) are covered by unit tests of their decision logic and by
  reviewed code, not by clicking through a deployed instance.

Consequently the following are **post-deploy checks**, not claims:

1. `npm run typecheck && npm run build` succeeds on Vercel.
2. `npm run db:migrate && npm run db:seed` applies cleanly to the Supabase
   database, and the exclusion constraint rejects an overlapping booking
   (verifiable with two concurrent inserts).
3. `X-Forwarded-For` / `x-real-ip` behaviour on the live edge makes
   `getClientIp()` resolve the real client address (audit hardening note 4).
4. Storage buckets exist, an upload succeeds, and a signed document URL expires.
5. `/api/cron/reminders` returns 501 without `CRON_SECRET` and 200 with it.

## 4. Local setup for a full run

```bash
npm install                  # needs network; ~1 min on a normal machine
npm run typecheck
npm run build
npm test
npm run db:migrate
npm run db:seed:demo
npm run dev                  # then walk the booking flow end to end
```
