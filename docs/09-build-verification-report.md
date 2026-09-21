# EDURA — build verification report (2026-09-21)

## 1. Verdict up front

| Requested | Result |
| --- | --- |
| `npm run build` in this environment | **Could not run.** Next 15's compiler startup dies silently here (evidence below). Not a defect in the project code: the failure is inside the runtime (iSH/emulated aarch64, Node 22) and happens before any page is compiled. |
| `npm start` / `npm run dev` | **Could not run.** `next dev` prints `✓ Starting...` and then the process group dies silently; no port is ever bound. |
| Browser screenshot of the running site | **Not possible**, because no server can start in this environment. A screenshot of the **real components with the real compiled stylesheet** was produced instead (see §4) — the interface is visually verified, the Next runtime is not. |
| Terminal log proving `Compiled successfully` | **Not obtainable here.** The gates in §3 are the strongest local proof available: they run the same two stages `next build` runs over the CSS, and they reproduce the exact failures the first deployment hit. |

The two failures in the pasted Vercel log **are fixed** (§2) and are now covered by
permanent local gates (§3) that fail for the same reasons the deployment did.

## 2. The two Vercel failures, fixed

### F-A · `UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins`
**Cause:** `src/components/auth/AuthForm.tsx` is a client component; it imported
`@/lib/validation/schemas`, which imported `@/lib/security/password`, which imports
`node:crypto` and `node:util`. webpack refuses to bundle Node builtins into a
browser chunk.

**Fix (module split, not a suppression):**
- `src/lib/security/password-policy.ts` — the PURE half (`PASSWORD_MIN_LENGTH`,
  `checkPasswordPolicy`, `passwordStrength`), no Node builtins, safe for the browser.
- `src/lib/security/password.ts` — now only hashing (needs `node:crypto`), and it
  re-exports the policy so existing server callers are unchanged.
- `src/lib/validation/schemas.ts` imports the policy module instead of the hashing
  module.

**Proof:** `npm run check:client` → `client boundary OK — 18 client module(s) bundle
for the browser` (esbuild bundles every `"use client"` module with
`platform=browser`, so it refuses a Node builtin exactly as webpack does).

### F-B · `Attempted import error: 'cookieMaxAge' is not exported from '@/lib/security/session'`
**Cause:** `src/app/api/auth/route.ts` imported `cookieMaxAge` from
`@/lib/security/session`, but it is defined in `@/lib/auth/service` (line 313). It
was only a warning in the log; at runtime it would have produced a session cookie
with `Max-Age=NaN`.

**Fix:** imported from the module that actually exports it.

**Proof:** `npm run check:imports` → `import graph OK — 139 entry point(s) resolved`.
esbuild validates *named exports* while resolving, so a wrong-module import fails
this gate — which is why it would have caught F-B before the deployment.

### F-C · `next@15.0.3` security warning (CVE-2025-66478)
Vercel warned that the pinned version is affected. `package.json` now pins
**next 15.0.5**, the patched release on the same minor line per the advisory's own
patched-version list. Still a patch-level upgrade.

## 3. The gates that now cover these failure classes

All three are in `package.json` and documented in `docs/06-testing.md`:

| Gate | Command | Result in this environment |
| --- | --- | --- |
| Client/server boundary | `npm run check:client` | **OK** — 18 client modules bundle for the browser |
| Import graph + named exports | `npm run check:imports` | **OK** — 139 entry points resolved |
| CSS (Tailwind → cssnano, the two stages `next build` runs) | `npm run check:css` | **OK** — tailwind 86,844 B, cssnano 60,968 B |
| Module syntax | `npm run check:syntax` | **OK** — 0 errors |
| Behaviour | `npm test` | **131/131 pass** (15 files) |

These were written *because* of the deployment failures: the first two deployment
failures were both invisible to syntax checks and unit tests, and the CSS one was
invisible to everything except the production minifier.

## 4. Visual verification (what was actually rendered)

`next` cannot serve pages here, so `src/preview/render-console.tsx` renders the
**shipped components** — `AdminShell`, `AdminNav`, `Kpi`/`KpiGrid`, `StatusPill`,
`TableScroll`, `BarChart`, `ActionButton`, `ActionForm`, `UploadForm`,
`StudentManager`, `AvailabilityEditor`, `TutorProfileForm`, `ReviewForm` — to
static HTML with the **real compiled Tailwind stylesheet** (compiled by the
project's own `tailwind.config.js`), and the in-app browser rendered the result:

- `preview-shots/admin-console-ar.jpg` — the Arabic console: RTL layout, Cairo
  type, six KPI tiles, booking table with localized status pills, the payments
  panel and the 14-day bar chart with Latin digits.
- The same harness emits `admin-overview-en.html`, `admin-tutors-{ar,en}.html` and
  `dashboards-{ar,en}.html` in `/var/minis/workspace/edura-preview/`.

The in-app browser wedged on subsequent navigations (every later page, including a
1.2 KB health-check page, timed out — so the WebView, not the markup, was at
fault), which is why there is one screenshot rather than four.

## 5. What the Next compiler did in this environment (raw evidence)

```
$ node node_modules/next/dist/bin/next build
   ▲ Next.js 15.0.3
   Creating an optimized production build ...
$ echo $?
0                     # ← no error, no artifacts, .next/ contains only cache/
```

```
$ node --trace-exit node_modules/next/dist/bin/next build
(no trace printed: the event loop drained instead of calling process.exit)
```

```
$ node node_modules/next/dist/bin/next dev -p 3000
   ▲ Next.js 15.0.3
   - Local:        http://localhost:3000
 ✓ Starting...
$ (process gone; nothing listening on 3000)
```

Also observed and worked around: webpack's default `output.hashFunction` is
`xxhash64`, implemented in WebAssembly, and this Node build has no usable
WebAssembly (`Warning: disabling flag --expose_wasm`), so the first build attempt
died inside `WasmHash.init`. `next.config.mjs` now honours an optional
`EDURA_HASH_FUNCTION` (e.g. `sha256`) so the build is not tied to WASM — unset in
production, so a normal deployment keeps webpack's faster default. With that set,
the build advances past the hash initialisation and then exits as shown above.

**How the dependencies were installed** (for reproducibility): `npm install` is
killed mid-resolution in this environment, so `node_modules` was assembled from
two installs that did complete plus direct registry tarballs
(`scripts/_fetch-deps.sh` fetches exact versions by URL, including
`@next/swc-linux-arm64-musl`, which loads and works). That is an environment
workaround, not a change to the project: `package.json` remains the install
contract for Vercel.

## 6. What to run to see it build

On Vercel (or any normal machine):

```bash
npm install
npm run check:syntax && npm run check:imports && npm run check:client && npm run check:css
npm test
npm run build      # ← the step this environment cannot perform
npm start
```

Everything before `npm run build` passes here, and the two errors from the pasted
log are fixed with gates that fail for the same reasons. If `next build` reports
anything new, paste the log and it will be fixed the same way — the gates now
cover the three failure classes this project has actually hit.

---

# 10. Brand kit v2 verification run — 2026-09-21

The platform was re-skinned from brand v1 (navy/blue, Manrope/Cairo, abstract
"E" mark) to **brand kit v2** (the client's brand presentation board: dhow +
pen-nib mark, turquoise/terracotta/sand/graphite, Poppins + Amani Kufi).
The decision record, the measurements and the substitutions are in
`docs/10-brand-kit-v2.md`.

## Gates

| Gate | Command | Result |
| --- | --- | --- |
| Syntax | `npm run check:syntax` | **0 errors** (all of `src/**`) |
| Unit tests | `npm test` | **131 passed / 0 failed** — 15 files |
| CSS pipeline | `npm run check:css` | tailwind **128,824 B** → cssnano **96,719 B**, both OK |
| Contrast | `npm run check:contrast` | **21 / 21** pairs meet WCAG AA (incl. 3:1 control borders) |
| Client boundary | `npm run check:client` | 18 client modules bundle for the browser |
| Import graph | `npm run check:imports` | **140 entry points** resolved in 6 batches |
| Row types | `npm run check:row-types` | OK |
| Design detector | `impeccable detect src/` | 0 in authored design; 50 `overused-font` notes confined to the generated `src/styles/fonts.css` (Open Sans `@font-face` rules — the face is named by the client's brand kit) |
| Visual QA | `src/preview/` harness → browser | reviewed at 390 px in **AR (RTL)** and **EN**: header, hero, tutor cards, subject grid, trust section, tutor profile, footer |

## Two defects that only a rendered screenshot could find

1. **Header logo clipped.** The component generator dropped each colour group's
   `transform`; potrace emits layers in tenths of a pixel, so the mark drew at
   10× and overflowed the lockup viewBox. Invisible in source, obvious on screen.
2. **English hero had a solid block behind the emphasised phrase.**
   `.display--onDark .display__em` set `background-image` + `-size` but not
   `-repeat`/`-position`; those existed only in the Arabic rule, so the 2 px
   underline tiled into a fill in the Latin locale.

Both fixed, both re-verified in the browser.

## Still not verified here (unchanged)

`next build`, `tsc --noEmit`, any query against a live database, and any real
browser end-to-end run. **Vercel remains the build gate.**

## Reproducing the brand

```bash
cd app && npm run brand:all     # mark → lockups → assets → fonts
npm run check:contrast          # after any palette change
```

The brand scripts read the board image, so they are re-runnable and the whole
identity can be regenerated from source rather than patched by hand.


---

## 11. Operational-script defects found while preparing the database — 2026-09-21

Bringing the live database up surfaced two real defects in the operational
scripts. Neither is reachable from `next build`, which is exactly why they had
survived every gate so far.

**1. `import { Client } from "pg"` throws in Node ESM.** `pg@8.13.1` ends with
`module.exports = new PG(Client)` — an object instance, not an object literal —
so Node's CommonJS named-export detection cannot see `Client` and the import
fails at parse time with `SyntaxError: Named export 'Client' not found`.
`scripts/migrate.mjs`, `scripts/seed-reference.mjs` and
`scripts/bootstrap-admin.mjs` all had it. **Every one of them was dead on
arrival** on a normal machine. Fixed by importing the default and destructuring
(`scripts/_env.mjs` → `pgClient()`), which works in every runtime.

**2. The scripts never loaded `.env.local`.** Next.js loads it automatically; a
standalone `node scripts/*.mjs` does not. So `npm run db:migrate` reported
"DATABASE_URL_DIRECT is required" with the file sitting right there. Fixed by
`scripts/_env.mjs`, which parses `.env.local` then `.env`, and never overrides a
variable that is already set — so Vercel and CI are unaffected.

Both were found by actually running the scripts, not by reading them.


---

## 12. Database brought live — 2026-09-21

| Step | Result |
| --- | --- |
| Supavisor transaction pooler (:6543) reachable | yes, IPv4, PostgreSQL 17.6 |
| Supavisor session pooler (:5432) reachable | yes, migrations only |
| `npm run db:migrate` | **33 tables** created (`0000_init.sql`, `0001_seed_reference.sql`) |
| Reference seed | 11 subjects · 3 stages · 14 areas · 5 lesson types · 2 plans |
| RBAC seed | 4 roles · 26 permissions · 68 role-permission rows |
| §20 concurrency guarantee | `bookings_no_tutor_overlap` — GiST `EXCLUDE (tutor_id WITH =, tsrange(starts_at, ends_at) WITH &&)` restricted to the seven active statuses |
| §21 idempotency | `bookings.idempotency_key` present |
| Admin bootstrap | `mfa_enabled = true`, `super_admin`, 26 permissions |
| App data layer | `listSubjects` 11 · `listStages` 3 · `listAreas` 14 · `listPlans` 2 · bound parameters · `withTransaction` round-trip — all through `src/lib/db`, not a side script |

Two more script defects were found here and are recorded in §11: the `pg` named
import (all three scripts were dead on arrival) and the scripts never loading
`.env.local`. `scripts/bootstrap-admin.mjs` additionally needed `loadEnv()`
added — the first patch missed it because the file has no `const root =
process.cwd()` line to anchor on.

The `db.<ref>.supabase.co` direct host was rejected: Supabase now makes it
IPv6-only and Vercel functions cannot reach it. This is the most common cause of
"works locally, fails on Vercel".

**Not verified:** a real request through the running application. `next build`
still has never run here.
