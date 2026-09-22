#!/usr/bin/env node
/**
 * WCAG contrast audit for the EDURA token palette.
 *
 * Run after ANY palette change:  node scripts/check-contrast.mjs
 * Exits non-zero if a documented pair drops below its required ratio, so a
 * future tweak to a brand colour cannot silently break accessibility.
 */
const PAL = {
  // Visual revision 2026-09-22: warm neutral paper, navy text, and terracotta
  // as the single accent. The teal family is retained ONLY for the logo.
  pearl: "#FAF7F1",
  white: "#FFFFFF",
  cream: "#F4EFE4",
  navy: "#16305A",
  navy700: "#1E3E6E",
  navy900: "#0F2244",
  ink: "#2C3956",
  inkSoft: "#4A5570",
  inkMute: "#657087",
  accent: "#BF6743",
  accentStrong: "#9E5231",
  accentTint: "#F7E9E1",
  sand: "#D7C097",
  sandTint: "#F3EADA",
  line: "#E8E0D2",
  lineStrong: "#8B8375",
  ok: "#2E7D5B",
  warn: "#8A5410",
  danger: "#B4392C",
  logoTeal: "#3F9DA5",
};

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h) => {
  const [r, g, b] = hex(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

// [foreground, background, minimum, what it is]
const PAIRS = [
  ["navy", "pearl", 4.5, "headings on the page"],
  ["ink", "pearl", 4.5, "body text on the page"],
  ["ink", "white", 4.5, "body text on cards"],
  ["inkSoft", "pearl", 4.5, "secondary text"],
  ["inkMute", "pearl", 4.5, "muted/meta text"],
  ["ink", "sandTint", 4.5, "text on a sand callout"],
  ["ink", "accentTint", 4.5, "text on a terracotta callout"],
  ["ink", "cream", 4.5, "text on the warm band"],
  ["accentStrong", "pearl", 4.5, "links and focus rings"],
  ["accentStrong", "white", 4.5, "links on cards"],
  ["white", "accentStrong", 4.5, "primary button label"],
  ["white", "navy", 4.5, "text on navy"],
  ["white", "navy900", 4.5, "text on the darkest surface"],
  ["navy", "pearl", 4.5, "navy on paper (figures, prices)"],
  ["sand", "navy", 4.5, "warm text on navy"],
  ["ok", "white", 4.5, "success text"],
  ["warn", "white", 4.5, "warning text"],
  ["danger", "white", 4.5, "error text"],
  ["lineStrong", "pearl", 3.0, "input border (non-text)"],
  ["lineStrong", "white", 3.0, "input border on cards"],
  ["logoTeal", "pearl", 2.9, "logo wordmark - WCAG exempts logos, bar is visibility"],
];

let fails = 0;
for (const [fg, bg, min, what] of PAIRS) {
  const r = ratio(PAL[fg], PAL[bg]);
  const ok = r >= min;
  if (!ok) fails++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${r.toFixed(2).padStart(6)} (min ${min})  ` +
      `${fg} on ${bg}  - ${what}`,
  );
}
console.log(`\n${PAIRS.length - fails}/${PAIRS.length} pairs pass`);
process.exit(fails ? 1 : 0);
