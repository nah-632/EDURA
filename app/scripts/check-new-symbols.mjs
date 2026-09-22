#!/usr/bin/env node
/**
 * Symbol gate — a narrow stand-in for the one thing tsc does that no other
 * local gate can.
 *
 * Two deploy cycles were lost to the same failure: an identifier used in JSX
 * but never defined or imported (`Cannot find name 'launchOffer'`). esbuild
 * parses without resolving names, the tests never render those branches, and
 * `tsc` cannot run in this environment at all — so it surfaced one Vercel build
 * at a time.
 *
 * This checks the specific identifiers a change introduces: for each, the file
 * that USES it must also DEFINE it (const/let/function), IMPORT it, or bind it
 * in an array destructure. It is not a typechecker and does not pretend to be.
 *
 * Add names to SYMBOLS when you introduce them.
 *
 * Usage: node scripts/check-new-symbols.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const SYMBOLS = [
  "launchOffer",
  "getLaunchOfferStatus",
  "launchOfferApplies",
  "tutorHasClaimedLaunchOffer",
  "subjectTint",
  "heroPhotoUrl",
  "bandPhotoUrl",
  "familyPhotoUrl",
  "brandMugUrl",
  "EmptyState",
];

const root = process.cwd();
const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (!/node_modules|\.next|preview|\.tmp/.test(p)) walk(p);
    } else if (/\.tsx?$/.test(p)) files.push(p);
  }
})(path.join(root, "src"));

const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const problems = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const sym of SYMBOLS) {
    const s = escaped(sym);
    if (!new RegExp(`\\b${s}\\b`).test(text)) continue;

    const defined =
      // const/let/var/function/class declaration
      new RegExp(`(?:const|let|var|function|class)\\s+${s}\\b`).test(text) ||
      // import { a, b } from  |  import X from  |  named in an import list
      new RegExp(`import[^;]*\\b${s}\\b[^;]*from`, "s").test(text) ||
      // array destructure, e.g. const [settings, guarantee, launchOffer] = …
      new RegExp(`\\[[^\\]]*\\b${s}\\b[^\\]]*\\]\\s*=`).test(text) ||
      // object destructure, e.g. const { launchOffer } = …
      new RegExp(`\\{[^}]*\\b${s}\\b[^}]*\\}\\s*=`).test(text) ||
      // exported from this file
      new RegExp(`export\\s+(?:async\\s+)?(?:const|function|class)\\s+${s}\\b`).test(text);

    if (!defined) {
      const line = text.slice(0, text.search(new RegExp(`\\b${s}\\b`))).split("\n").length;
      problems.push(`${path.relative(root, file)}:${line}  '${sym}' used but never defined or imported`);
    }
  }
}

if (problems.length) {
  console.error("symbol gate FAILED\n");
  for (const p of problems) console.error("  " + p);
  console.error(
    `\n${problems.length} identifier(s) reach a page without being defined.` +
      `\nesbuild will not catch this and tsc cannot run here — it would have` +
      `\nfailed the Vercel build instead.`,
  );
  process.exit(1);
}
console.log(`symbol gate OK — ${SYMBOLS.length} tracked symbols all defined where used`);
