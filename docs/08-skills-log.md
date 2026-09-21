# EDURA — skill utilisation log (§34)

The brief requires the installed skills to be *actually invoked* at the
corresponding phase, and requires anything that could not run to be stated rather
than skipped silently. This log records what happened in this environment.

## Invoked, with the result

| Phase | Skill | What it produced |
| --- | --- | --- |
| 4 · delivery | **security-audit** | Full source-first audit of the app: 8 findings written to `security-audit/run-1/` (`architecture.md`, `REPORT.md`, `FINDINGS-DETAIL.md`, `findings.json`), validated with the skill's own `validate-findings.cjs` (PASS: 8 findings valid). 1 HIGH + 4 MEDIUM + 1 LOW confirmed and **fixed in the same run**, 2 hypotheses rejected with evidence. |
| 4 · delivery | **impeccable** (Rust engine 0.1.5) | Ran `impeccable detect` on the new UI surface (`src/components/**` → 0 findings) and on `src/styles/globals.css`: 3 anti-patterns found and fixed (two one-sided 3px accent borders — the classic generated-UI tell — replaced with a tinted surface + coloured hairline; and an animated `width` progress fill replaced with `transform: scaleX()` that respects RTL). Re-run: **0 anti-patterns**, 1 advisory (the hero's blueprint grid) kept deliberately and documented. |
| 3 · implementation | **web-interface-guidelines** | Applied to every new interactive surface: labels on all inputs, `aria-pressed` on toggle chips, `aria-live` status regions, `aria-busy` on pending actions, 44px minimum targets, 16px minimum input font size, keyboard-operable everything, filters as URLs so they work without JavaScript. |
| 4 · delivery | **ponytail / ponytail-review** (its principle, applied by hand) | Kept the implementation to the simplest thing that works: one generic `ActionButton` + `ActionForm` + `UploadForm` instead of ~20 bespoke admin client components; console filters as links rather than client state; no chart library (bars are divs); the RBAC matrix reported read-only rather than building an editor that would drift from the code. |
| 0 · planning | **prompt-engineering** | Used for the self-directed build briefs at each phase (domain layer → routes → console → dashboards → audit), which is why the work proceeded in coherent layers rather than screen by screen. |
| 2 · brand | **brandkit** (earlier session, per `docs/HANDOFF.md` and `scripts/brand_*.py`) | v1: the supplied logo was traced to vector, lockup/mark SVGs and the favicon set were produced from it, and the palette was measured from the artwork. Fonts (Manrope, Cairo, Fraunces, Amiri) were fetched and self-hosted under `public/fonts/`. **Superseded by v2.** |
| 2b · brand v2 | **brandkit** + `impeccable` (2026-09-21) | The client's real brand board was vectorised (softmax colour partition → per-component smoothing → potrace), the lockup geometry was measured and the wordmark tracking solved, all assets regenerated, the design system re-tokenised, and the result verified visually at 390 px in AR and EN. Two defects found only by looking. `impeccable detect`: 0 in authored design. Record: `docs/10-brand-kit-v2.md`. |

## Available but not applicable here (with what was done instead)

| Skill | Why not | Substitute |
| --- | --- | --- |
| **browser-automation** | No local browser engine can run in this environment (documented at length in `/var/minis/skills/browser-automation/SKILL.md`: Chromium cannot start under the emulation layer). There is also no deployed instance to drive. | Unit tests of the decision logic behind each flow (131 assertions), plus a static preview harness (`src/preview/`) for rendering real components with the real compiled CSS. The remaining end-to-end checks are listed as post-deploy steps in `docs/06-testing.md` §3 rather than claimed. |
| **supabase-cli** | No Supabase project exists yet for EDURA (no credentials in the environment); the database was never reachable. | Hand-written, sqlglot-validated migrations (`drizzle/0000_init.sql`, `0001_seed_reference.sql`), a migration runner that records applied files, and a seed runner. Applying them is the first post-deploy step. |
| **21st-dev**, **imagegen-frontend-web/mobile**, **image-to-code**, **nano-banana**, **codex-image**, **stitch-design-taste**, **gpt-taste**, **ui-ux-pro-max**, **high-end-visual-design**, **bilingual-quote-generator**, **task-observer**, **superpowers**, **design-taste-frontend** | Not installed in this environment (the 21st CLI is present but requires a token that is not configured; the image-generation skills need provider keys). | The design direction was derived from the supplied brand kit plus the two installed design skills that DO run (impeccable, web-interface-guidelines). Stated here rather than silently skipped, as §34 requires. |
| **github-sync-helper**, **cloudflare-dns** | No repository remote and no domain/DNS work in scope for this build. | Files are staged on disk under `/var/minis/shared/edura/`; DNS is a deployment step in `docs/07-deployment.md`. |
| **self-improving-agent** | Its purpose (logging learnings for future iterations) is served by this document plus `docs/HANDOFF.md`, which is the project's own durable context file. | `docs/HANDOFF.md` is updated at the end of every phase. |

## What this log is not

It is not a claim that every listed skill ran. Where a capability was missing, the
substitute is named and its limits are stated in the deliverable (notably: no
`next build`, no `tsc`, no database, no browser end-to-end run in this
environment — see `docs/06-testing.md` §3).
