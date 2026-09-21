import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  allowedTransitions,
  assertTransition,
  bookingStatuses,
  canReview,
  canTransition,
  holdsSlot,
  isTerminal,
  slotHoldingStatuses,
  transitions,
  TransitionError,
  type BookingStatus,
} from "@/lib/booking/state";

test("every declared status is reachable from pending_payment", () => {
  const seen = new Set<BookingStatus>(["pending_payment"]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const from of [...seen]) {
      for (const to of Object.keys(transitions[from]) as BookingStatus[]) {
        if (!seen.has(to)) {
          seen.add(to);
          grew = true;
        }
      }
    }
  }
  const unreachable = bookingStatuses.filter((s) => !seen.has(s));
  assert.deepEqual(unreachable, [], `unreachable statuses: ${unreachable.join(", ")}`);
});

test("the happy path is a legal chain for the right actors", () => {
  assert.ok(canTransition("pending_payment", "payment_verification", "customer"));
  assert.ok(canTransition("payment_verification", "paid", "admin"));
  assert.ok(canTransition("paid", "confirmed", "admin"));
  assert.ok(canTransition("confirmed", "tutor_accepted", "tutor"));
  assert.ok(canTransition("tutor_accepted", "scheduled", "tutor"));
  assert.ok(canTransition("scheduled", "in_progress", "tutor"));
  assert.ok(canTransition("in_progress", "completed", "tutor"));
});

test("no arbitrary jumps are possible", () => {
  assert.ok(!canTransition("pending_payment", "completed", "admin"));
  assert.ok(!canTransition("pending_payment", "confirmed", "admin"));
  assert.ok(!canTransition("cancelled", "confirmed", "admin"));
  assert.ok(!canTransition("refunded", "paid", "admin"));
  assert.ok(!canTransition("completed", "in_progress", "admin"));
});

test("only an admin verifies money and refunds it", () => {
  assert.ok(!canTransition("payment_verification", "paid", "customer"));
  assert.ok(!canTransition("payment_verification", "paid", "tutor"));
  assert.ok(!canTransition("refund_requested", "refunded", "customer"));
  assert.ok(canTransition("refund_requested", "refunded", "admin"));
});

test("self-transitions are rejected", () => {
  for (const status of bookingStatuses) {
    assert.equal(canTransition(status, status, "admin"), false, `${status} -> ${status} must be refused`);
  }
});

test("terminal states have no outgoing edges", () => {
  for (const status of ["cancelled", "rejected", "refunded"] as BookingStatus[]) {
    assert.equal(isTerminal(status), true, `${status} must be terminal`);
    assert.deepEqual(Object.keys(transitions[status]), []);
  }
});

test("assertTransition throws a typed error", () => {
  assert.throws(() => assertTransition("pending_payment", "completed", "admin"), TransitionError);
  assert.doesNotThrow(() => assertTransition("paid", "confirmed", "admin"));
});

test("allowedTransitions is actor-scoped", () => {
  assert.deepEqual(allowedTransitions("pending_payment", "customer").sort(), ["cancelled", "payment_verification"]);
  assert.ok(allowedTransitions("payment_verification", "admin").includes("paid"));
  // a customer may still cancel while a transfer is being verified - but may
  // never mark it paid
  assert.deepEqual(allowedTransitions("payment_verification", "customer"), ["cancelled"]);
});

test("reviews are only possible on a completed booking", () => {
  assert.equal(canReview("completed"), true);
  for (const s of bookingStatuses.filter((x) => x !== "completed")) {
    assert.equal(canReview(s), false, `${s} must not be reviewable`);
  }
});

test("the slot-holding list matches the SQL exclusion-constraint predicate", () => {
  // If these two ever drift, the application would think a slot is free while
  // the database refuses to allocate it (or worse, the reverse).
  const root = process.env.EDURA_APP_DIR ?? process.cwd();
  const sql = fs.readFileSync(path.join(root, "drizzle", "0000_init.sql"), "utf8");
  const idx = sql.indexOf("bookings_no_tutor_overlap");
  assert.ok(idx > -1, "exclusion constraint must exist in the migration");
  const predicate = sql.slice(idx, idx + 600);
  const match = /where \(status in \(([^)]*)\)\)/i.exec(predicate);
  assert.ok(match, `could not read the constraint predicate:\n${predicate}`);
  const inSql = match![1]!
    .split(",")
    .map((s) => s.trim().replace(/'/g, ""))
    .filter(Boolean)
    .sort();
  assert.deepEqual(inSql, [...slotHoldingStatuses].sort());
});

test("holdsSlot agrees with the constraint list", () => {
  for (const status of bookingStatuses) {
    assert.equal(holdsSlot(status), slotHoldingStatuses.includes(status));
  }
});
