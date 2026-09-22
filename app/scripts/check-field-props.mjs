#!/usr/bin/env node
/**
 * Field-literal gate.
 *
 * Why this exists: the first `next build` this project ever ran failed on
 *
 *   src/app/[locale]/admin/notifications/page.tsx:61
 *   Object literal may only specify known properties, and 'required' does not
 *   exist in type '{ kind: "textarea"; ... }'
 *
 * The union's `textarea` and `select` variants had silently drifted from the
 * other field kinds, so a property the submit handler already read and call
 * sites already passed was not declared. Nothing local caught it: esbuild
 * parses without resolving types, the 131 tests never type a field literal, and
 * `tsc` cannot run in the build environment at all (it dies on a single file).
 *
 * So this gate reads the union out of ActionForm.tsx and checks every field
 * literal in the codebase against it - the same relationship TypeScript checks,
 * narrowed to the one place that actually broke.
 *
 * Usage: node scripts/check-field-props.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const FORM = path.join(root, "src", "components", "forms", "ActionForm.tsx");

/** index of the `}` matching the `{` at `open`, or -1 */
function matchBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** start index of the innermost `{...}` containing `at` */
function enclosingObject(text, at) {
  let depth = 0;
  for (let i = at; i >= 0; i--) {
    if (text[i] === "}") depth++;
    else if (text[i] === "{") {
      if (depth === 0) return i;
      depth--;
    }
    if (at - i > 4000) break;
  }
  return -1;
}

/** top-level `name?:` / `name:` keys of an object literal type body */
function keysOf(body) {
  const keys = new Set();
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth--;
    else if (depth === 0) {
      const m = /^([A-Za-z_$][\w$]*)\s*\??\s*:/.exec(body.slice(i));
      if (m && (i === 0 || /[\s;,{|]/.test(body[i - 1]))) {
        keys.add(m[1]);
        i += m[0].length - 1;
      }
    }
  }
  return keys;
}

// ── 1. read the union out of the form component ─────────────────────────────
const form = readFileSync(FORM, "utf8");

const commonMatch = /type FieldCommon = \{([^}]*)\}/.exec(form);
const commonKeys = commonMatch ? keysOf(commonMatch[1]) : new Set();

const unionStart = form.indexOf("export type FormField =");
const unionEnd = form.indexOf("export interface ActionFormProps", unionStart);
const union = form.slice(unionStart, unionEnd);

const allowed = new Map(); // kind -> Set(props)
for (const m of union.matchAll(/kind:\s*((?:"[a-z]+"\s*\|?\s*)+)/g)) {
  const kinds = [...m[1].matchAll(/"([a-z]+)"/g)].map((k) => k[1]);
  const objStart = enclosingObject(union, m.index + m[0].length - 6);
  if (objStart < 0) continue;
  const objEnd = matchBrace(union, objStart);
  if (objEnd < 0) continue;
  const own = keysOf(union.slice(objStart + 1, objEnd));
  const isCommon = /FieldCommon\s*&\s*$/.test(union.slice(Math.max(0, objStart - 40), objStart).trimEnd() + " ");
  const props = new Set([...own, ...(isCommon ? commonKeys : [])]);
  for (const k of kinds) allowed.set(k, props);
}

if (allowed.size === 0) {
  console.error("field gate: could not parse the FormField union — the gate is broken, not the code.");
  process.exit(1);
}

// ── 2. check every field literal in the codebase ────────────────────────────
const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (!/node_modules|\.next|preview|\.tmp/.test(p)) walk(p);
    } else if (/\.tsx?$/.test(p)) files.push(p);
  }
})(path.join(root, "src"));

let checked = 0;
const problems = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/kind:\s*"([a-z]+)"/g)) {
    const kind = m[1];
    const props = allowed.get(kind);
    if (!props) continue; // not a form field (some other `kind` discriminator)
    const start = enclosingObject(text, m.index);
    if (start < 0) continue;
    const end = matchBrace(text, start);
    if (end < 0) continue;
    checked++;
    const used = keysOf(text.slice(start + 1, end));
    const unknown = [...used].filter((k) => !props.has(k) && k !== "kind");
    if (unknown.length) {
      const { line } = (() => {
        const before = text.slice(0, start).split("\n");
        return { line: before.length };
      })();
      problems.push(
        `${path.relative(root, file)}:${line}  kind "${kind}" does not accept: ${unknown.join(", ")}`,
      );
    }
  }
}

// ── 3. report ──────────────────────────────────────────────────────────────
if (problems.length) {
  console.error("field gate FAILED\n");
  for (const p of problems) console.error("  " + p);
  console.error(
    `\n${problems.length} field literal(s) pass a property the FormField union does not declare.` +
      `\nThis is the exact shape of the error that broke the first production build.`,
  );
  process.exit(1);
}
console.log(
  `field gate OK — ${checked} field literal(s) checked against ${allowed.size} field kinds`,
);
