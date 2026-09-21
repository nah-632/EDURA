# 10 — Brand kit v2 (the re-skin)

> Status: **applied.** This supersedes the v1 identity that shipped in the first
> build sessions (navy/blue + Manrope/Cairo + the abstract "E" mark).

## 1. Why this happened — two conflicting brand sources

The master directive's §4 names the *attached* Edura brand kit as the
authoritative visual source and forbids redesigning it. Two different artefacts
have been supplied against that clause:

| | **v1** (received 2026-09-20) | **v2 — applied** (received 2026-09-21) |
|---|---|---|
| Artefact | a single logo file | a full brand presentation board |
| Mark | abstract blue "E" | dhow whose bow is a **pen nib** |
| Palette | navy `#102A56` · blue `#2563EB` | turquoise · terracotta · sand · graphite · pearl |
| Type | Manrope + Cairo | Poppins + "Open" (Latin) · Amani Kufi (Arabic) |
| Tagline | "The right tutor. A brighter future." | "Your Path to Educational Success" |

**Decision (recorded, per the directive's rule 8 — resolve conflicts and
document them): v2 wins.**

Reasons, in order of weight:

1. §4 says *use the attached brand kit*, and v2 is attached now. Where a
   written description and the artefact it describes disagree, the artefact
   governs.
2. v2 is internally complete — mark, palette with named swatches, both
   typefaces, and applied mockups (app, brochure, card, merchandise). v1 was a
   single logo file.
3. v2 carries this project's real identifiers: the directive's official WhatsApp
   number `+973 6666 1238` and the platform's own email, on the business card
   and brochure. It is not a stock template.
4. §6 asks for "premium, modern, human, warm, local, safe". v2's palette and
   dhow/pen-nib mark carry that; v1's navy/blue is the generic EdTech default.

The user confirmed the decision explicitly before implementation began.

Nothing from v1 was deleted: it is archived under `brand/v1/`.

## 2. What was measured, not guessed

Every value below was read off the board by pixel measurement, not eyeballed.

| Token | Value | How it was taken |
|---|---|---|
| turquoise | `#3F9DA5` | mean of the mark's dominant turquoise pixels |
| terracotta | `#BF6743` | swatch centre, 14×14 mean |
| sand | `#D7C097` | swatch centre, 14×14 mean |
| graphite | `#33383A` | swatch centre (board labels it inconsistently) |
| pearl (page) | `#FBF8F2` | board paper, corrected for the photo's warm cast |

Lockup geometry (the board's main lockup, pixel-profile measurement):

| | measured | used |
|---|---|---|
| mark ink | 211 × 214 px | aspect 0.996 |
| wordmark ink | 241 × 50 px | **cap = 0.2336 × mark height** |
| mark→wordmark gap | 104 px | **0.486 × mark height** |
| wordmark ink aspect | 4.82 | tracking solved: **+0.0485 em** |

The tracking is *solved*, not chosen: it is the value at which Poppins' own ink
aspect reproduces the board's 4.82 (Poppins' natural aspect is 4.545). The
tagline's cap height is likewise solved so that its width matches the
wordmark's, which is the lockup rule the board itself obeys.

## 3. Typography — and one documented substitution

The board's typography panel reads:

```
إدورا أماني        Open
Amani Kufi         Poppins
```

Read as a font sampler (each name is drawn in the face it names) that is
**Poppins** and **Open Sans** for Latin, **Amani Kufi** for Arabic — two
Latin faces set in two visibly different typefaces in the same panel.

**Amani Kufi is a commercial face with no distributable licence**, so it cannot
be self-hosted. It is substituted by the closest freely licensed Kufi pair, and
the substitution is deliberate and recorded here:

| role | kit names | shipped |
|---|---|---|
| Latin display | Poppins | Poppins (as named) |
| Latin body/UI | "Open" → Open Sans | Open Sans (as read) |
| Arabic display | Amani Kufi | **Reem Kufi** (Kufi substitute) |
| Arabic body/UI | Amani Kufi | **Noto Kufi Arabic** (Kufi substitute) |

Two Arabic faces rather than one: a display Kufi at UI text sizes is
uncomfortable to read, so the Kufi character is kept at both registers with one
face optimised for each. All four are self-hosted woff2 subsets
(`scripts/brand2_fonts.py`), 765 KB total, weights 400–800.

**Known detector override.** `impeccable detect` flags `Open Sans` as an
overused font, 50 times. All 50 are `@font-face` rules in the generated
`src/styles/fonts.css`; the authored design (`globals.css`, `components/`)
reports **0** anti-patterns. The face is named by the client's brand kit, so it
stays — brand compliance beats a genericity heuristic. This override is
deliberate and is the only outstanding detector finding.

## 4. The mark, and how it was vectorised

Script: `scripts/brand2_vectorize.py` (input: the board JPEG).

The board is a photograph, so a naive threshold trace makes potrace follow JPEG
staircases and the curves wobble at large sizes. The pipeline that works:

1. classify every native pixel into the four brand colours with a softmax over
   squared colour distance (edge pixels blend, and the softmax splits them in
   proportion);
2. **smooth at native resolution** — upsampling first just carries the noise up
   with it (that was the failed second attempt);
3. a deterministic `argmax` partition, so no layer can hold a sliver of its
   neighbour (independent thresholds left a sand fringe welded under the hull);
4. morphological opening on the warm layers — a terracotta shape on cream paper
   has an anti-aliased rim whose colour passes straight through the sand
   reference colour, leaving 1 px tendrils on the sparkles;
5. per-layer blur radius — one radius tuned for the hull rounds the 10 px
   sparkles away, one tuned for the sparkles leaves the hull's long edges
   wobbling, so each connected component gets its own;
6. blur → upscale ×8 → single threshold, so potrace sees an already-smooth
   contour;
7. potrace fits the beziers.

Result: sand 1, terracotta 2, turquoise 2 — each one a real shape of the mark.
Verified by rasterising and looking at it.

**The sparkle cluster was removed — client decision, 2026-09-21.**

The board's four sparkles are slender four-point stars whose points taper to
almost nothing. Magnified 7x, that is unmistakable; at the board's resolution
each small one is ~10 px, so the taper is below what the raster can resolve and
every honest trace of those pixels returns a diamond — visibly the wrong shape
beside the one large sparkle that *is* resolvable. Reconstructing them from
fitted geometry was tried (position, size and waist solved against the board's
own sub-pixel coverage) and abandoned: at 24 px the fit is dominated by lens and
print blur, and the markers were never carrying brand meaning anyway.

The client chose to drop them. `scripts/brand2_vectorize.py` now removes the
small compact terracotta components from the layer before tracing
(`strip_sparkles`); the mast survives because it is a thin vertical rule that
fails the compactness test. The mark is the **dhow, its pen-nib bow and the
wave** — 5 paths instead of 9, aspect 1.097.

## 5. Deliverables

`brand/v2/` — 13 SVGs (mark, mono mark, horizontal/stacked/wordmark lockups,
reverse + mono of each, app icon + reverse, maskable tile, EN + AR signature
lockups, OG card), PNG rasters at 16→1024, measures in `mark-metrics.json`,
`lockup-metrics.json` and `assets-manifest.json`.

Installed into the app at `app/public/brand/`; the React component
`app/src/components/brand/EduraLogo.tsx` is generated from the same geometry
(`scripts/make_logo_component.py`) and holds **one** copy of the mark paths and
**one** copy of the wordmark paths, placed by transform — 38 KB instead of the
~120 KB six pre-composed SVGs would have cost.

Arabic signature lockup (`edura-logo-signature-ar.svg`) is shaped with HarfBuzz
(`uharfbuzz`), because drawing a TTF's glyphs by character code produces
isolated letterforms.

## 6. Application in the app

* Palette replaced token-for-token in `app/src/styles/globals.css`; the one-shot
  migration is kept as `app/scripts/apply_brand_v2_tokens.py`.
* Role assignment, so the palette works rather than just being present:
  * **turquoise** — identity and graphics. At `#3F9DA5` it cannot carry text
    (3.0:1 on white), so it is never a text or button-background colour.
  * **terracotta `#9E5231`** — the action colour: buttons, because white on it
    is 5.67:1.
  * **deep teal `#17434A`** — dark brand surfaces and headings.
  * **sand / tints** — warm secondary surfaces.
* Contrast is **verified, not assumed**: `app/scripts/check-contrast.mjs`
  asserts 21 foreground/background pairs against WCAG AA, including the 3:1
  requirement for control borders (`--line-strong`). 21/21 pass.
* Header/footer, hero, tutor cards, admin console, dashboards, emails and the
  booking handoff all inherit the tokens — nothing hard-codes a brand colour.

## 7. Defects found by *looking*, not by reading

Both were invisible in source review and appeared only in the rendered preview
(`src/preview/` harness, screenshots at 390 px AR and EN):

1. **The header logo rendered clipped and squashed.** The component generator
   kept each colour group's `fill` but dropped its `transform`. potrace emits
   its layers in tenths of a pixel (`translate(0,H) scale(0.1,-0.1)`), so the
   mark drew at 10× and overflowed the lockup viewBox. *Fix: keep every
   attribute of the source group.*
2. **The English hero drew a solid turquoise block behind the emphasised
   phrase.** `.display--onDark .display__em` set `background-image` and
   `background-size` but not `background-repeat`/`-position`; those lived only in
   the Arabic rule, so in the Latin locale the 2 px rule tiled and filled the
   phrase. *Fix: repeat the full background state in the shared rule.*

Also fixed while in there: eight of ten subject tiles fell back to a generic
glyph, so the subject grid read as broken — every subject code in the reference
data now has its own icon. The hero's technical grid background was replaced by
a wave field that echoes the mark (an engineering grid fights the warm, human
identity the kit defines).

## 8. Verified / not verified

**Verified in this environment**
* `npm run check:syntax` (esbuild over `src/**`): 0 errors.
* `npm test`: **131/131**, one node process per file — see §9.
* `npm run check:css`: tailwind **128,824 B** → cssnano **96,719 B**, both OK.
* `npm run check:contrast`: **21/21**.
* `impeccable detect`: 0 in authored design; the 50 `overload-font` notes are
  confined to the generated `fonts.css` (§3).
* Visual QA: rendered the real components with the real compiled stylesheet and
  reviewed at 390 px in Arabic (RTL) and English — home, header, hero, tutor
  cards, subject grid, trust section, tutor profile, footer.
* All brand scripts are re-runnable end to end (`npm run brand:all`).

**Not verified**
* `next build`, `tsc --noEmit`, any query against a live database, and any
  browser end-to-end run — as before, **Vercel is the build gate**.
* The substitute Arabic faces have not been reviewed by an Arabic typographer;
  Reem Kufi in particular is a display face and should be sanity-checked on real
  content before launch.

## 9. Environment notes worth keeping

* **`node --test .tmp-tests/*.js` is not trustworthy here.** One process for the
  whole suite intermittently SIGSEGVs on a different file each run, so a real
  regression and a memory crash look identical. `scripts/run-tests.mjs` runs one
  process per file; the same 131 tests then pass every time.
* **`process.exit()` after `console.log()` silently discards output when stdout
  is a pipe**, which made the CSS gate look like it had run when it had not.
  `check-css.mjs` now sets `process.exitCode`.
* The tailwind+cssnano compile is memory-hungry here and fails non-deterministically;
  when it does, re-run it — a successful compile is reproducible.
* `rsvg-convert` is the only SVG rasteriser present; ImageMagick's internal SVG
  renderer mangles these files.
