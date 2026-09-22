# 11 — Visual revision (2026-09-22)

> Status: **applied.** Supersedes the visual layer of `docs/10-brand-kit-v2.md`
> (the palette and typography changed; the logo, mark and lockups did not).

The operator's brief named specific patterns as generated-site tells and asked
for the colour system to be derived from the logo's terracotta sail rather than
from a dark gradient. This is the record of what changed, what it replaced, and
what was deliberately kept.

## 1. Colour

The palette is now warm neutral paper, navy text, and **one** accent.

| role | before | after |
| --- | --- | --- |
| page | `#FBF8F2` | `#FAF7F1` (warmer) |
| headings / dark surfaces | deep teal `#17434A` | **navy `#16305A`** |
| body text | graphite `#33383A` | navy-tinted ink `#2C3956` |
| accent | turquoise `#3F9DA5` used broadly | **terracotta `#BF6743`** used sparingly |
| turquoise | links, focus, callouts, buttons | **the logo only** |

Why: the brief is explicit that the accent should come from the terracotta sail
and be used sparingly, not as a section background. Turquoise stays in the mark
and the wordmark — it is part of the identity — but it no longer carries links,
focus rings or button fills. `var(--brand)` is now referenced zero times in
`globals.css`.

Contrast is verified, not assumed: `app/scripts/check-contrast.mjs` asserts
**21 pairs** against WCAG AA and passes. The one pair below AA is the logo
wordmark at 2.99:1, and that is deliberate — WCAG explicitly exempts logos, and
changing a brand colour to satisfy a rule written for text would be the wrong
trade. The assertion is set to "visible" with the reason recorded inline.

Migration is reproducible: `app/scripts/apply_visual_revision.py`.

## 2. Typography

The previous pair read as default families. The new pairing is warm-display +
neutral-body in **both** scripts, so the two languages share a mood instead of
looking like two unrelated sites.

| | Latin | Arabic |
| --- | --- | --- |
| headings | **Fraunces** | **El Messiri** |
| body / UI | **Public Sans** | **IBM Plex Sans Arabic** |

All four are self-hosted woff2 subsets (`scripts/brand2_fonts.py`), 465 KB in
total — *down* from 765 KB, because the old set carried two families that were
only used for display. The layout's font preloads were also pointing at
Fraunces and Amiri files deleted during the brand re-skin, so every page load
requested two fonts that 404'd; they now preload Fraunces and El Messiri.

## 3. The patterns that were removed

Each was removed **structurally** — the element is gone from the markup, not
hidden with CSS — so nothing pretends it was still wanted.
`app/scripts/strip-templated-patterns.py` is the record.

| pattern | count | what replaced it |
| --- | --- | --- |
| tracked all-caps eyebrow label + its leading rule | 34 | nothing; the section heading carries the framing |
| `→` / `←` appended to buttons and links | 4 | nothing; the button text says what it does |
| italic, differently-coloured second line of a heading | 2 headings | one weight, one colour |
| dark teal gradient + wavy-line hero background | the hero | a photograph on warm paper |
| decorative glow gradient behind a tutor's name | the profile header | a solid navy band |
| the dark-navy repeat across band + CTA + footer | 3 sections | one photographic band, one paper CTA, one navy footer |

Two exceptions were kept on purpose:

* The Arabic time-range separator (`09:00 → 11:00`) in the availability editor is
  content, not decoration.
* The tracked treatment on the two-letter language toggle in the header is a
  control, not a section label.

The Bahraini-identity line is still in the hero — §5 of the master brief requires
it there. It is ordinary text now instead of a label with a rule in front of it.

## 4. Photography

Four supplied images, prepared by `scripts/prepare_photos.py` into
`app/public/brand/photo/`:

| image | where | note |
| --- | --- | --- |
| desk / skyline / dhow | hero | **cropped** at x=470 to remove the branded panel |
| father and son | "How it works" | beside the numbered steps |
| classroom / smart screen | the "become a tutor" band | behind a directional scrim |
| mug product shot | footer signature | brand asset, deliberately not on the landing flow |

**The hero crop matters.** The supplied artwork had the logo, a two-line
headline and a tagline printed into its left third. Putting that behind live
HTML would have shown two sets of taglines in one viewport — the exact thing the
brief warns against — and a raster logo ages badly the moment the lockup
changes. The panel is cropped off and the photograph is used as a photograph.

Note also that the laptop lid and the mug carry the logo mark; at display size
that reads as a brand detail rather than competing text, so they were kept.

## 5. Cards and empty states

* **Subject tiles** previously shared one identical template. Each subject now
  has its own glyph (eleven of them, drawn on the same 24×24 grid) and a tint
  drawn from the brand palette — five tints, not eleven, because a rainbow
  reads as decoration rather than information.
* **Empty states** were a white box with a thin border and two lines of text,
  identical from the admin console to the public homepage. There is now an
  `EmptyState` component: the brand mark as an anchor, a short title, one
  sentence, and — where one exists — the action that fills the space. Two tones,
  so a dense console screen does not get a decorative panel.

## 6. Two defects found while doing this

1. **The preview harness could not show any of it.** It opened the generated
   HTML from a directory, so root-absolute URLs like `/brand/photo/hero.jpg`
   resolved against the filesystem root and the hero photograph rendered as a
   broken image — while the fonts loaded fine, because a stylesheet's `url()`
   resolves relative to the CSS file. The harness now rewrites those prefixes.
2. **A mangled CSS selector** introduced by my own removal pass:
   `html[lang|="ar"] /* comment */ .display--onDark .display--onDark { … }`.
   Repaired. Worth recording because a regex that strips `rule { … }` blocks is
   exactly the kind of tool that quietly leaves half a selector behind.

## 7. What was preserved

The brief required the structure and behaviour to survive untouched, and it did:
the search form (all three fields and its `GET` action), the booking stepper,
the EN/AR toggle and every locale route, the admin console, the 131 tests, and
the whole design-token architecture. No component was rewritten that did not
need to be; the hero and the empty state are the only new structures.

## 8. Verified

`syntax 0 errors` · `131/131 tests` · `contrast 21/21` · `field gate 94 literals`
· `client boundary 18 modules` · `CSS tailwind 90,792 → cssnano 61,595` ·
`imports 141 entry points` · and visual QA of the rendered page at 390 px in
Arabic: hero, how-it-works, subject grid, photo band, CTA, footer.

**Not verified:** `next build` locally (Vercel remains the build gate), and no
review by an Arabic typographer of El Messiri at heading sizes on real copy.
