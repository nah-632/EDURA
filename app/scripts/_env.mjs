/**
 * Environment loading for the operational scripts.
 *
 * Next.js loads `.env.local` automatically; a standalone `node scripts/*.mjs`
 * does not. Without this, `npm run db:migrate` fails with "DATABASE_URL is
 * required" even though the file is right there — which is exactly how it
 * behaved before.
 *
 * Values already present in the real environment always win, so Vercel (or a
 * CI runner) is never overridden by a stale local file.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const FILES = [".env.local", ".env"];

function parse(text) {
  const out = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadEnv(root = process.cwd()) {
  const loaded = [];
  for (const file of FILES) {
    let text;
    try {
      text = readFileSync(path.join(root, file), "utf8");
    } catch {
      continue;
    }
    for (const [key, value] of Object.entries(parse(text))) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
        loaded.push(`${file}:${key}`);
      }
    }
  }
  return loaded;
}

/** pg is CommonJS and exports a constructed object, not an object literal, so
 *  `import { Client } from "pg"` throws at parse time under Node's native ESM.
 *  The default import works in every runtime. */
export async function pgClient() {
  const pg = (await import("pg")).default;
  return pg.Client;
}

export function connectionString() {
  return process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
}

export function sslFor(url) {
  return /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false };
}
