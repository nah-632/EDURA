#!/usr/bin/env node
/**
 * CSS gate: compile the stylesheet with Tailwind and minify it the way
 * `next build` does, and FAIL if either stage throws.
 *
 * Why this exists: Next runs cssnano over the compiled CSS. cssnano's gradient
 * minifier cannot parse logical direction keywords inside `linear-gradient()`
 * (`to inline-end`), and it fails with "Cannot read properties of undefined
 * (reading 'length')" — a crash that only appears at build time, on the
 * production minifier, after everything else has passed. That exact crash broke
 * the first Vercel deployment of this project.
 *
 * Usage:
 *   node scripts/check-css.mjs [--out <file>]
 *
 * `--out` also writes the compiled (unminified) stylesheet. The static preview
 * harness uses it so it renders with exactly the CSS this gate verified.
 *
 * `cssnano` is optional: when it is not installed the Tailwind compile still
 * runs (which catches syntax and config errors) and the minify stage is
 * reported as skipped rather than silently passing.
 *
 * NOTE: this file sets `process.exitCode` instead of calling `process.exit()`.
 * When stdout is a pipe — which is how CI and this environment capture it —
 * `process.exit()` discards anything still buffered, so a failing gate could
 * report nothing at all and still look like it had run.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const entry = path.join(root, "src", "styles", "globals.css");
const fonts = path.join(root, "src", "styles", "fonts.css");

const outIdx = process.argv.indexOf("--out");
const outFile = outIdx > -1 ? process.argv[outIdx + 1] : null;

async function load(name) {
  try {
    return await import(name);
  } catch (error) {
    console.error(`  (import of ${name} failed: ${error.message})`);
    return null;
  }
}

const postcssModule = await load("postcss");
const tailwindModule = await load("tailwindcss");
if (!postcssModule || !tailwindModule) {
  console.error("postcss and tailwindcss are required (run `npm install` first).");
  process.exitCode = 1;
} else {
  const postcss = postcssModule.default ?? postcssModule;
  const tailwind = tailwindModule.default ?? tailwindModule;

  const config = (await import(path.join(root, "tailwind.config.js"))).default;
  config.content = config.content.map((glob) => path.join(root, glob));

  const source = fs
    .readFileSync(entry, "utf8")
    .replace('@import "./fonts.css";', fs.readFileSync(fonts, "utf8"));

  let compiled;
  try {
    compiled = await postcss([tailwind(config)]).process(source, { from: entry });
    console.log(`tailwind  OK   ${compiled.css.length} bytes`);
  } catch (error) {
    console.error(`tailwind  FAIL ${error.message}`);
    process.exitCode = 1;
  }

  if (compiled && outFile) {
    fs.writeFileSync(outFile, compiled.css);
    console.log(`written   OK   ${outFile}`);
  }

  const cssnanoModule = compiled ? await load("cssnano") : null;
  if (compiled && !cssnanoModule) {
    console.log("cssnano   SKIP not installed — the minify stage was not verified.");
  } else if (compiled) {
    const cssnano = cssnanoModule.default ?? cssnanoModule;
    try {
      const minified = await postcss([cssnano({ preset: "default" })]).process(
        compiled.css,
        { from: "compiled.css" },
      );
      console.log(`cssnano   OK   ${minified.css.length} bytes`);
    } catch (error) {
      console.error(`cssnano   FAIL ${error.message}`);
      console.error(
        "\nThe production minifier rejected the compiled CSS. Common cause: a logical\n" +
          "direction keyword inside a gradient (use `to right` / `to left` plus an\n" +
          'explicit [dir="rtl"] override).',
      );
      process.exitCode = 1;
    }
  }
}
