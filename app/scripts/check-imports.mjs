#!/usr/bin/env node
/**
 * Import-resolution gate.
 *
 * `esbuild file.ts --outfile=/dev/null` parses a file but does NOT resolve its
 * imports, so a wrong path or a symbol imported from the wrong module survives
 * every local check and only appears during `next build` (this is exactly how
 * `cookieMaxAge`, imported from `@/lib/security/session` while it lives in
 * `@/lib/auth/service`, reached production as a webpack warning).
 *
 * This script bundles every entry point of the application — each route, page
 * and layout, plus every `src/lib` module — for the Node platform, which forces
 * the full import graph to be resolved. Anything unresolved is reported with the
 * importing file, and the script exits non-zero.
 *
 * Usage: node scripts/check-imports.mjs
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { rmSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);

function loadEsbuild() {
  try {
    return require("esbuild");
  } catch {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    return require(path.join(globalRoot, "esbuild"));
  }
}

const esbuild = loadEsbuild();
const root = process.cwd();

// Leave no trace: this scratch dir held 254 generated .js files (~9 MB) that
// were committed by mistake before .gitignore learned about it.
function cleanup() {
  try { rmSync(path.join(root, ".tmp-imports-check"), { recursive: true, force: true }); } catch {}
}
const srcRoot = path.join(root, "src");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const all = walk(srcRoot).filter((file) => !file.includes(`${path.sep}preview${path.sep}`));
// Every executable piece of the app, plus the domain layer as its own entry, so
// an unused module with a broken import is caught too.
const entries = all.filter(
  (file) =>
    /\/(page|layout|route|not-found|error)\.tsx?$/.test(file) ||
    file.includes(`${path.sep}src${path.sep}lib${path.sep}`),
);

/**
 * Bundled in batches: one process covering every entry point exhausted memory in
 * the environment this project was verified in (esbuild reports "The service was
 * stopped"). Batching keeps the peak flat and still fails on the first
 * unresolved import, reporting every entry point it checked.
 */
const BATCH = 25;
let checked = 0;

for (let i = 0; i < entries.length; i += BATCH) {
  const batch = entries.slice(i, i + BATCH);
  try {
    await esbuild.build({
      entryPoints: batch,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "es2022",
      outdir: path.join(root, ".tmp-imports-check"),
      alias: { "@": srcRoot },
      // Stylesheets are not part of the import-resolution question, and their
      // url(/fonts/…) references are public paths, not files to resolve.
      external: ["next", "next/*", "react", "react-dom", "react-dom/*", "pg", "*.css"],
      // Bare package imports are taken as given: the question this gate asks is
      // whether OUR paths and named exports resolve. Bundling the whole npm tree
      // also exhausted memory in this environment.
      packages: "external",
      logLevel: "silent",
    });
    checked += batch.length;
  } catch (error) {
    const failures = error.errors ?? [];
    if (failures.length === 0) {
      console.error(error.message);
      process.exit(1);
    }
    console.error(`${failures.length} unresolved import(s):\n`);
    for (const failure of failures) {
      const where = failure.location
        ? `${path.relative(root, failure.location.file)}:${failure.location.line}`
        : "?";
      console.error(`  ${where}  ${failure.text}`);
      for (const note of failure.notes ?? []) {
        if (note.text) console.error(`      ↳ ${note.text.replace(/\n/g, "\n      ")}`);
      }
      console.error("");
    }
    process.exit(1);
  }
}
console.log(`import graph OK — ${checked} entry point(s) resolved in ${Math.ceil(entries.length / BATCH)} batch(es)`);
cleanup();
