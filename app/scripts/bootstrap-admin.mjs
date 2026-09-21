#!/usr/bin/env node
/**
 * Administrator bootstrap (§15).
 *
 * Creates the first admin account with TOTP MFA enabled and prints the secret
 * plus an otpauth:// URL you can paste into an authenticator app.
 *
 * Why a script instead of seed SQL: an admin account needs a real scrypt hash
 * and a real base32 TOTP secret. Rather than re-implement either (and drift
 * from the server's own implementation), this script bundles the app's actual
 * `password.ts` and `totp.ts` with esbuild and uses them. If esbuild is not
 * available, it says so and stops - it never falls back to a weaker scheme.
 *
 * Usage:
 *   ADMIN_BOOTSTRAP_EMAIL=admin@example.bh \
 *   ADMIN_BOOTSTRAP_PASSWORD='a-strong-password' \
 *   node scripts/bootstrap-admin.mjs
 */
import process from "node:process";
import { loadEnv, pgClient } from "./_env.mjs";

loadEnv();

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

if (!url) {
  console.error("DATABASE_URL_DIRECT (preferred) or DATABASE_URL is required.");
  process.exit(1);
}
if (!email || !password) {
  console.error("ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD are required.");
  process.exit(1);
}

/** Compile the app's own modules and import them from memory. */
async function loadAppModules() {
  let esbuild;
  try {
    esbuild = await import("esbuild");
  } catch {
    console.error(
      "esbuild is required to compile the app's password/TOTP modules.\n" +
        "Install dependencies first (npm install) - this script deliberately does\n" +
        "not re-implement hashing or TOTP on its own.",
    );
    process.exit(1);
  }
  const entry = `
    export { hashPassword, checkPasswordPolicy } from "./src/lib/security/password.ts";
    export { generateTotpSecret, totpUri } from "./src/lib/security/totp.ts";
  `;
  const result = await esbuild.build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

const app = await loadAppModules();

const policy = app.checkPasswordPolicy(password);
if (!policy.ok) {
  console.error(`Password rejected by the platform policy: ${policy.reasons.join(", ")}`);
  process.exit(1);
}

const passwordHash = await app.hashPassword(password);
const mfaSecret = app.generateTotpSecret();
const otpauth = app.totpUri(mfaSecret, email);

const Client = await pgClient();
const client = new Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query("begin");
  const existing = await client.query("select id from users where email_normalized = $1 and deleted_at is null", [email]);
  let userId;
  if (existing.rows.length > 0) {
    userId = existing.rows[0].id;
    await client.query(
      `update users set password_hash = $2, primary_role = 'admin', status = 'active',
              mfa_secret = $3, mfa_enabled = true, failed_logins = 0, locked_until = null
        where id = $1`,
      [userId, passwordHash, mfaSecret],
    );
    console.log(`updated existing account ${email}`);
  } else {
    const inserted = await client.query(
      `insert into users (email, phone, password_hash, primary_role, status, locale, mfa_secret, mfa_enabled)
       values ($1, $2, $3, 'admin', 'active', 'ar', $4, true)
       returning id`,
      [email, `+9730000${Math.floor(Math.random() * 9000 + 1000)}`, passwordHash, mfaSecret],
    );
    userId = inserted.rows[0].id;
    console.log(`created admin ${email}`);
  }
  await client.query(
    `insert into user_profiles (user_id, full_name, preferred_locale)
     values ($1, $2, 'ar')
     on conflict (user_id) do update set full_name = excluded.full_name`,
    [userId, email],
  );
  // Both roles are granted: `super_admin` is what the RBAC matrix checks, and
  // granting it explicitly keeps the join-based checks honest (loadSession()
  // also implies it for admin accounts, but the row should exist).
  await client.query(
    `insert into user_roles (user_id, role_id)
     select $1, id from roles where code = 'super_admin'
     on conflict do nothing`,
    [userId],
  );
  await client.query("commit");

  console.log("\nAdd this secret to an authenticator app (Google Authenticator, 1Password, Authy):");
  console.log(`  secret: ${mfaSecret}`);
  console.log(`  otpauth: ${otpauth}`);
  console.log("\nSign in at /ar/admin/login with the email/password above and the 6-digit code.");
  console.log("Then remove ADMIN_BOOTSTRAP_* from the environment.\n");
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(`bootstrap failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
