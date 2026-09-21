#!/usr/bin/env node
/**
 * Reference-data seed.
 *
 * Applies `drizzle/0001_seed_reference.sql`: the RBAC matrix, education
 * catalogue, lesson types, subscription plans and the settings row. It is
 * idempotent (every insert is guarded), so it is safe to re-run after an
 * operator has edited the catalogue — their edits are not overwritten.
 *
 * Demo content is deliberately NOT part of this script: demo data is applied
 * only when asked for, with `--demo`, so a production database can never end up
 * with demo tutors by accident.
 *
 * Usage:
 *   node scripts/seed-reference.mjs          # reference data only
 *   node scripts/seed-reference.mjs --demo   # reference data + demo content
 *   node scripts/seed-reference.mjs --remove-demo
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { loadEnv, pgClient } from "./_env.mjs";

const root = process.cwd();
loadEnv(root);
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_DIRECT (preferred) or DATABASE_URL is required.");
  process.exit(1);
}

const withDemo = process.argv.includes("--demo");
const removeDemo = process.argv.includes("--remove-demo");
if (withDemo && removeDemo) {
  console.error("--demo and --remove-demo cannot be combined.");
  process.exit(1);
}

const Client = await pgClient();
const client = new Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
});

async function apply(relativePath, label) {
  const sql = await readFile(path.join(root, relativePath), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    console.log(`ok      ${label}`);
  } catch (error) {
    await client.query("rollback").catch(() => {});
    console.error(`FAILED  ${label}: ${error.message}`);
    throw error;
  }
}

try {
  await client.connect();
  if (removeDemo) {
    await apply("drizzle/dev/demo_seed_remove.sql", "remove demo data");
  } else {
    await apply("drizzle/0001_seed_reference.sql", "reference data");
    if (withDemo) {
      await apply("drizzle/0002_demo_seed.sql", "DEMO data (development only)");
      console.log("\nDemo accounts (development only):");
      console.log("  demo.parent1@demo.edura.bh / EduraDemo#2026");
      console.log("  demo.parent2@demo.edura.bh / EduraDemo#2026");
      console.log("  demo.tutor1@demo.edura.bh  / EduraTutor#2026");
      console.log("  demo.tutor2@demo.edura.bh  / EduraTutor#2026");
      console.log("  demo.tutor3@demo.edura.bh  / EduraTutor#2026");
      console.log("Remove them with: npm run db:seed -- --remove-demo\n");
    }
  }
} finally {
  await client.end().catch(() => {});
}
