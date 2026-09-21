#!/usr/bin/env node
/**
 * Row-type gate.
 *
 * Database row declarations must carry the SAME union the domain and the
 * database enum use — never `string`.
 *
 * Why this exists: the third production build failed with
 *
 *   Type error: Argument of type 'string' is not assignable to parameter of type
 *   '"pending_payment" | … | "refunded"'.
 *   src/app/[locale]/admin/bookings/[id]/page.tsx:42
 *     const nextStatuses = allowedTransitions(booking.status, "admin");
 *
 * because `BookingAdminRow.status` was declared as `string` while the state
 * machine takes `BookingStatus`. TypeScript cannot run in the environment this
 * project was built in (proved: the CLI and the compiler API both exit silently,
 * even on a deliberately wrong assignment), so the rule is enforced here instead
 * — as text analysis that always runs.
 *
 * Usage: node scripts/check-row-types.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const libRoot = path.join(root, "src", "lib");

/** status-ish properties that must never be typed as a bare `string`. */
const REQUIRED_UNIONS = {
  status: "BookingStatus | TutorStatus | PaymentStatus | ReviewStatus | SubscriptionStatus | UserStatus",
  paymentStatus: "PaymentStatus | null",
  subscriptionStatus: "SubscriptionStatus | null",
  primaryRole: "UserRoleKind",
  accountStatus: "UserStatus",
};

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

const offenders = [];
let checked = 0;

for (const file of walk(libRoot)) {
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");
  lines.forEach((line, index) => {
    // Only declaration lines inside interfaces/types: `name: string;`
    const match = /^\s*(\w+)\??:\s*string\s*(?:\|\s*null)?\s*;?\s*$/.exec(line);
    if (!match) return;
    const property = match[1];
    if (!Object.prototype.hasOwnProperty.call(REQUIRED_UNIONS, property)) return;
    checked += 1;
    offenders.push({
      file: path.relative(root, file),
      line: index + 1,
      text: line.trim(),
      should: REQUIRED_UNIONS[property],
    });
  });
}

if (offenders.length === 0) {
  console.log(`row types OK — no status-like property typed as a bare string (${checked} declarations inspected)`);
  process.exit(0);
}

console.error(`${offenders.length} row-type violation(s):\n`);
for (const item of offenders) {
  console.error(`  ${item.file}:${item.line}  ${item.text}`);
  console.error(`      ↳ use the domain union instead: ${item.should}\n`);
}
console.error(
  "A status column typed as `string` cannot be handed to a state-machine function\n" +
    "without a cast, and the production build rejects that cast's absence. Import the\n" +
    "union from the module that defines the state machine or the enum mirror.",
);
process.exit(1);
