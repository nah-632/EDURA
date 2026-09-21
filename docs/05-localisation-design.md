# EDURA — localisation, design system and copy

## 1. Languages

Arabic is the default (`DEFAULT_LOCALE = "ar"`), English is a first-class
second locale. Everything is bilingual in one dictionary layer:

- 1,100+ keys across eight modules (`common`, `public`, `booking`, `account`,
  `tutor`, `admin`, `legal`, `trust`), composed by `lib/i18n/index.ts`.
- Copy is **data, not code**: the notification domain renders its own text at
  read time from a type plus parameters, so a notification created in Arabic is
  read correctly in English later, and changing wording never needs a migration.
- The i18n test suite fails the build if the two dictionaries drift (missing
  keys, duplicate keys across modules, placeholder mismatch, Arabic leaking into
  English values).

## 2. Numbers, money and dates (Bahrain conventions)

| Convention | Rule |
| --- | --- |
| Digits | **Latin in both languages** (`12.500`, never `١٢٫٥٠٠`) — the Gulf convention |
| Money | BHD with its native **three** decimals: `12.500 د.ب` / `BHD 12.500`, grouped thousands |
| Money internals | decimal strings and integer millimes; never a float |
| Dates | `20 سبتمبر 2026` / `20 September 2026`, always rendered in `Asia/Bahrain` |
| Times | 12-hour with `ص/م` or `AM/PM` |
| Durations | `1 س 30 د` / `1 h 30 m` |
| Phone | stored E.164 (`+973XXXXXXXX`), displayed `+973 6666 1238` |
| Weekdays | derived from `Intl` via `weekdayName()`, week starting Sunday |

## 3. RTL

- `<html lang dir>` is set in the root layout, so the correct direction is in the
  first byte of HTML — no client-side flip, no RTL flash.
- Layout uses logical properties; the language switch preserves the current path.
- Numerals, phone numbers, emails, codes (`EDU-…`) and brand names carry
  `translate="no"` and render LTR inside RTL text.
- The admin console is a data surface: tables get a scroll container and a
  minimum width rather than being crushed into one word per line.

## 4. Design system

Tokens live in `src/styles/globals.css` (the single source of truth);
`tailwind.config.js` only mirrors names. Two typographic registers, deliberately
separated:

- **Product surfaces** — Open Sans (Latin) + Noto Kufi Arabic (Arabic):
  dashboards, forms, tables, the booking stepper.
- **Marketing surfaces only** — Poppins (Latin) + Reem Kufi (Arabic) for the
  hero, the tutor profile band and the "become a tutor" band. Keeping a Kufi at
  both registers preserves the identity the brand kit defines while leaving the
  dense surfaces readable; the display face never appears where data density
  matters.

These are the faces the client's brand kit names (Poppins + "Open", and Amani
Kufi for Arabic), with Amani Kufi substituted because it is commercial and
cannot be self-hosted. The full reasoning, the measurements and the
substitution table are in `docs/10-brand-kit-v2.md`.

Accessibility is baked into the primitives rather than reviewed afterwards:
44px minimum touch targets, 16px minimum input font size (prevents iOS zoom),
visible focus states, semantic landmarks, a skip link, `scroll-margin-top`,
`text-wrap: balance`, tabular numerals for money, status never signalled by
colour alone, and `prefers-reduced-motion` honoured globally (no state depends on
an animation to become visible).

## 5. Voice

- Confident, specific, local. "منصة بحرينية بفخر" / "Proudly Bahraini" is a
  first-class hero element, not a footer disclaimer, and the About page gives it
  substance (two sides of the community: families and teaching talent).
- Never invent numbers. Where there is no data yet the screen says so, and the
  demo fixtures are labelled as demo wherever they are rendered.
- Errors are actionable and translated: the API returns stable codes, the UI maps
  them to copy (`lib/i18n/api-errors.ts`), and driver text never reaches a user.

## 6. Copy that had to be written, not translated

The About, Guarantee and expanded Privacy sections (addendum §A–C) were authored
in both languages rather than translated word-for-word, because a literal
translation of marketing Arabic reads as machine output. Every factual claim in
them is a description of behaviour that exists in the code — verification before
listing, payment verification before confirmation, the configurable claim window,
and the explicit list of what the guarantee does **not** cover.
