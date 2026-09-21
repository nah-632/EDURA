#!/usr/bin/env node
/**
 * Migration runner.
 *
 * Applies every `drizzle/*.sql` file in lexicographic order and records what it
 * applied in `schema_migrations`, so a second run is a no-op and a partially
 * applied file is impossible (each file runs inside one transaction).
 *
 * Connection string preference: `DATABASE_URL_DIRECT` (session mode, port 5432)
 * because DDL must not run through a transaction-mode pooler, which cannot keep
 * a connection for the duration of a multi-statement migration.
 *
 * Usage:
 *   node scripts/migrate.mjs            # apply pending migrations
 *   node scripts/migrate.mjs --status   # list what is applied / pending
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { loadEnv, pgClient } from "./_env.mjs";

const root = process.cwd();
loadEnv(root);
const dir = path.join(root, "drizzle");
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;

if (!url) {
  console.error(
    "DATABASE_URL_DIRECT (preferred) or DATABASE_URL is required.\n" +
      "Supabase: Project settings → Database → Connection string.\n" +
      "Use the session-mode string (:5432) for migrations.",
  );
  process.exit(1);
}

const statusOnly = process.argv.includes("--status");
const files = (await readdir(dir, { withFileTypes: true }))
  // Demo content is NOT a migration: `--demo` on the seed script applies it,
  // so a production migrate can never insert demo tutors into a real database.
  .filter((entry) => entry.isFile() && entry.name.endsWith(".sql") && !/demo/i.test(entry.name))
  .map((entry) => entry.name)
  .sort();

const Client = await pgClient();
const client = new Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
});

await client.connect();
await client.query(`
  create table if not exists schema_migrations (
    name       text primary key,
    applied_at timestamptz not null default now()
  )
`);

const applied = new Set(
  (await client.query("select name from schema_migrations")).rows.map((row) => row.name),
);

if (statusOnly) {
  for (const file of files) console.log(`${applied.has(file) ? "applied" : "pending"}  ${file}`);
  await client.end();
  process.exit(0);
}

let failures = 0;
for (const file of files) {
  if (applied.has(file)) {
    console.log(`skip    ${file}`);
    continue;
  }
  const sql = await readFile(path.join(dir, file), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into schema_migrations (name) values ($1)", [file]);
    await client.query("commit");
    console.log(`applied ${file}`);
  } catch (error) {
    await client.query("rollback").catch(() => {});
    console.error(`FAILED  ${file}: ${error.message}`);
    failures += 1;
    break;
  }
}

await client.end();
process.exit(failures === 0 ? 0 : 1);
