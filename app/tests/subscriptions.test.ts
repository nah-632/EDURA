import test from "node:test";
import assert from "node:assert/strict";

import {
  DAY_MS,
  canRequestRenewal,
  computeActivation,
  daysRemaining,
  isListable,
  shouldWarnExpiry,
  subscriptionPhase,
  type SubscriptionShape,
} from "@/lib/subscriptions/rules";

/**
 * Subscription rules (§37). The two facts that matter commercially are proven
 * here: a renewal extends an active period instead of replacing it, and an
 * expired subscription removes the tutor from search while a grace period does
 * not.
 */
const plan = { durationDays: 30, graceDays: 3 };
const now = new Date("2026-09-20T00:00:00Z");

test("a first activation starts today", () => {
  const window = computeActivation(plan, now, null);
  assert.equal(window.startsAt.getTime(), now.getTime());
  assert.equal(window.expiresAt.getTime(), now.getTime() + 30 * DAY_MS);
  assert.equal(window.graceUntil.getTime(), now.getTime() + 33 * DAY_MS);
  assert.equal(window.renewed, false);
});

test("a renewal stacks onto the remaining time instead of discarding it", () => {
  const current: SubscriptionShape = {
    status: "active",
    startsAt: new Date(now.getTime() - 20 * DAY_MS),
    expiresAt: new Date(now.getTime() + 10 * DAY_MS),
    graceUntil: new Date(now.getTime() + 13 * DAY_MS),
  };
  const window = computeActivation(plan, now, current);
  assert.equal(window.renewed, true);
  assert.equal(window.startsAt.getTime(), current.expiresAt!.getTime());
  assert.equal(window.expiresAt.getTime(), current.expiresAt!.getTime() + 30 * DAY_MS);
});

test("an expired subscription restarts from today", () => {
  const expired: SubscriptionShape = {
    status: "active",
    startsAt: new Date(now.getTime() - 60 * DAY_MS),
    expiresAt: new Date(now.getTime() - 30 * DAY_MS),
    graceUntil: new Date(now.getTime() - 27 * DAY_MS),
  };
  const window = computeActivation(plan, now, expired);
  assert.equal(window.renewed, false);
  assert.equal(window.startsAt.getTime(), now.getTime());
});

test("phases distinguish active, grace and expired", () => {
  const active: SubscriptionShape = {
    status: "active",
    startsAt: null,
    expiresAt: new Date(now.getTime() + DAY_MS),
    graceUntil: new Date(now.getTime() + 4 * DAY_MS),
  };
  assert.equal(subscriptionPhase(active, now), "active");

  const inGrace: SubscriptionShape = {
    status: "active",
    startsAt: null,
    expiresAt: new Date(now.getTime() - DAY_MS),
    graceUntil: new Date(now.getTime() + 2 * DAY_MS),
  };
  assert.equal(subscriptionPhase(inGrace, now), "grace");
  // Grace keeps the tutor listed; expiry does not.
  assert.equal(isListable("grace"), true);
  assert.equal(isListable("active"), true);
  assert.equal(isListable("expired"), false);

  const lapsed: SubscriptionShape = {
    status: "active",
    startsAt: null,
    expiresAt: new Date(now.getTime() - 10 * DAY_MS),
    graceUntil: new Date(now.getTime() - 7 * DAY_MS),
  };
  assert.equal(subscriptionPhase(lapsed, now), "expired");
  assert.equal(subscriptionPhase({ ...lapsed, status: "pending" }, now), "pending");
  assert.equal(subscriptionPhase({ ...lapsed, status: "cancelled" }, now), "cancelled");
  assert.equal(subscriptionPhase(null, now), "expired");
});

test("days remaining always counts to the end of access", () => {
  assert.equal(daysRemaining({ status: "active", startsAt: null, expiresAt: null, graceUntil: null }, now), 0);
  assert.equal(
    daysRemaining({ status: "active", startsAt: null, expiresAt: new Date(now.getTime() + 2 * DAY_MS), graceUntil: null }, now),
    2,
  );
  // Inside grace the countdown runs to the grace end, not the expiry date.
  assert.equal(
    daysRemaining(
      {
        status: "active",
        startsAt: null,
        expiresAt: new Date(now.getTime() - DAY_MS),
        graceUntil: new Date(now.getTime() + 3 * DAY_MS),
      },
      now,
    ),
    3,
  );
});

test("the expiry warning respects its window and repeats at most daily", () => {
  assert.equal(
    shouldWarnExpiry({ phase: "active", daysLeft: 3, lastWarnedAt: null, now, withinDays: 7 }),
    true,
  );
  assert.equal(
    shouldWarnExpiry({ phase: "active", daysLeft: 30, lastWarnedAt: null, now, withinDays: 7 }),
    false,
  );
  assert.equal(
    shouldWarnExpiry({ phase: "active", daysLeft: 3, lastWarnedAt: new Date(now.getTime() - 3_600_000), now }),
    false,
  );
  assert.equal(
    shouldWarnExpiry({ phase: "active", daysLeft: 3, lastWarnedAt: new Date(now.getTime() - DAY_MS), now }),
    true,
  );
  // Already in grace: the countdown message has been sent, and repeating it
  // would be noise rather than information.
  assert.equal(shouldWarnExpiry({ phase: "grace", daysLeft: 1, lastWarnedAt: null, now }), false);
});

test("one open request at a time", () => {
  assert.equal(canRequestRenewal(null), true);
  assert.equal(canRequestRenewal({ status: "active", startsAt: null, expiresAt: null, graceUntil: null }), true);
  assert.equal(canRequestRenewal({ status: "pending", startsAt: null, expiresAt: null, graceUntil: null }), false);
});
