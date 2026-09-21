#!/usr/bin/env node
/**
 * Client-boundary gate.
 *
 * A `"use client"` module and everything it imports are bundled for the
 * BROWSER. If any module in that graph touches a Node builtin (`node:crypto`,
 * `node:util`, `fs`, `pg`, …) the production build fails with
 * `UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins`.
 *
 * That is exactly what broke the first deployment: `AuthForm.tsx` (a client
 * component) imported the validation schemas, which imported the password
 * module, which imports `node:crypto`. Nothing local caught it, because esbuild
 * syntax checks and unit tests do not enforce the client/server boundary.
 *
 * This script bundles every client entry with `platform=browser`, which makes
 * esbuild refuse a Node builtin in a browser graph the same way webpack does —
 * so the failure happens here, not on the deployment.
 *
 * Usage: node scripts/check-client-boundary.mjs
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { rmSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);

function loadEsbuild() {
  try {
    return require("esbuild");
  } catch {
    // Local installs are the normal case; CI images often have a global one.
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    return require(path.join(globalRoot, "esbuild"));
  }
}

const esbuild = loadEsbuild();
const root = process.cwd();

// Leave no trace: this scratch dir held 254 generated .js files (~9 MB) that
// were committed by mistake before .gitignore learned about it.
function cleanup() {
  try { rmSync(path.join(root, ".tmp-client-check"), { recursive: true, force: true }); } catch {}
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

/** A file is a client entry when its first statement is the directive. */
function isClientModule(file) {
  const source = readFileSync(file, "utf8");
  const header = source.slice(0, 400).replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "");
  return /^["']use client["'];?/.test(header.trimStart());
}

const entries = walk(srcRoot).filter(isClientModule);
if (entries.length === 0) {
  console.error("No client components found — is this the right directory?");
  process.exit(1);
}

try {
  await esbuild.build({
    entryPoints: entries,
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2022",
    outdir: path.join(root, ".tmp-client-check"),
    alias: { "@": srcRoot },
    // Next's own client modules bundle fine; the question here is only whether
    // MY code drags a Node builtin or a server-only module into the browser.
    external: ["next/*", "react", "react-dom", "react-dom/*", "clsx", "tailwind-merge"],
    logLevel: "silent",
    metafile: true,
  });
  console.log(`client boundary OK — ${entries.length} client module(s) bundle for the browser`);
} catch (error) {
  const failures = error.errors ?? [];
  if (failures.length === 0) {
    console.error(error.message);
    process.exit(1);
  }
  console.error(`${failures.length} client-boundary error(s):\n`);
  for (const failure of failures) {
    const where = failure.location ? `${path.relative(root, failure.location.file)}:${failure.location.line}` : "?";
    console.error(`  ${where}  ${failure.text}`);
    for (const note of failure.notes ?? []) {
      if (note.text) console.error(`      ↳ ${note.text.replace(/\n/g, "\n      ")}`);
    }
    console.error("");
  }
  console.error(
    "A client component is reaching server-only code. Split the module (see\n" +
      "src/lib/security/password-policy.ts for the pattern: the pure half is shared,\n" +
      "the half that needs a Node builtin stays server-side).",
  );
  process.exit(1);
}
cleanup();
