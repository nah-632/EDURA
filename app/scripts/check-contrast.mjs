#!/usr/bin/env node
/**
 * WCAG contrast audit for the EDURA token palette.
 *
 * Run after ANY palette change:  node scripts/check-contrast.mjs
 * Exits non-zero if a documented pair drops below its required ratio, so a
 * future tweak to a brand colour cannot silently break accessibility.
 */
const PAL = {
  pearl: "#FBF8F2",
  white: "#FFFFFF",
  deep: "#17434A",
  deep700: "#1F545C",
  deep900: "#0E2E33",
  turquoise: "#3F9DA5",
  turquoise600: "#35858C",
  turquoise700: "#2A6E75",
  turquoise100: "#DFEEEF",
  turquoise50: "#F0F7F7",
  terracotta: "#BF6743",
  terracotta700: "#9E5231",
  terracotta100: "#F8E9E1",
  sand: "#D7C097",
  sand100: "#F3EADA",
  graphite: "#33383A",
  graphiteSoft: "#4A5254",
  graphiteMute: "#666E70",
  line: "#E7DFD2",
  lineStrong: "#8B8375",
  ok: "#2E7D5B",
  warn: "#8A5410",
  danger: "#B4392C",
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
  ["graphite", "pearl", 4.5, "body text on the page"],
  ["graphite", "white", 4.5, "body text on cards"],
  ["graphiteSoft", "pearl", 4.5, "secondary text"],
  ["graphiteMute", "pearl", 4.5, "muted/meta text"],
  ["graphite", "sand100", 4.5, "text on a sand callout"],
  ["graphite", "turquoise100", 4.5, "text on a turquoise callout"],
  ["turquoise700", "pearl", 4.5, "links"],
  ["turquoise700", "white", 4.5, "links on cards"],
  ["white", "terracotta700", 4.5, "primary button label"],
  ["white", "deep", 4.5, "text on the deep brand surface"],
  ["white", "deep900", 4.5, "text on the darkest surface"],
  ["turquoise", "deep", 3.0, "brand accent on dark (large/graphic)"],
  ["sand", "deep", 4.5, "warm text on dark"],
  ["deep", "sand", 4.5, "dark text on a sand band"],
  ["deep", "turquoise100", 4.5, "dark text on a turquoise band"],
  ["terracotta700", "white", 4.5, "danger-adjacent accent text"],
  ["ok", "white", 4.5, "success text"],
  ["warn", "white", 4.5, "warning text"],
  ["danger", "white", 4.5, "error text"],
  ["lineStrong", "pearl", 3.0, "input border (non-text)"],
  ["white", "turquoise", 3.0, "white on the brand turquoise (large only)"],
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
