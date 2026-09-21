import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_GUARANTEE,
  evaluateClaim,
  guaranteeSummary,
  type GuaranteeConfig,
} from "@/lib/guarantee/rules";

/**
 * Guarantee rules (addendum §C).
 *
 * The guarantee is a published commercial promise, so its eligibility rules are
 * tested rather than trusted: each of the five refusal reasons must be reachable
 * and the acceptance path must produce the configured remedy.
 */
const config: GuaranteeConfig = DEFAULT_GUARANTEE;
const completedAt = new Date("2026-09-20T12:00:00Z");

function claim(overrides: Partial<Parameters<typeof evaluateClaim>[1]> = {}) {
  return evaluateClaim(config, {
    bookingStatus: "completed",
    lessonEndedAt: completedAt,
    completedSessionsWithTutor: 1,
    alreadyClaimed: false,
    now: new Date("2026-09-20T18:00:00Z"),
    ...overrides,
  });
}

test("an eligible claim returns the configured replacement", () => {
  const decision = claim();
  assert.equal(decision.eligible, true);
  if (decision.eligible) {
    assert.equal(decision.remedy, "replacement_tutor");
    assert.equal(decision.sessions, config.replacementSessions);
  }
});

test("a credit is offered when the customer prefers it", () => {
  const decision = claim({ preferCredit: true });
  assert.equal(decision.eligible, true);
  if (decision.eligible) assert.equal(decision.remedy, "session_credit");
});

test("the platform cannot advertise a guarantee it has switched off", () => {
  const decision = evaluateClaim({ ...config, satisfactionEnabled: false }, {
    bookingStatus: "completed",
    lessonEndedAt: completedAt,
    completedSessionsWithTutor: 1,
    alreadyClaimed: false,
    now: completedAt,
  });
  assert.deepEqual(decision, { eligible: false, reason: "guarantee_disabled" });
});

test("a lesson that has not happened cannot be claimed", () => {
  assert.deepEqual(claim({ bookingStatus: "scheduled" }), { eligible: false, reason: "not_completed" });
  assert.deepEqual(claim({ lessonEndedAt: null }), { eligible: false, reason: "not_completed" });
});

test("the claim window is inclusive at its boundary and closes after it", () => {
  const exactlyAtWindow = new Date(completedAt.getTime() + config.claimWindowHours * 3_600_000);
  assert.equal(claim({ now: exactlyAtWindow }).eligible, true);

  const oneMsLate = new Date(exactlyAtWindow.getTime() + 1);
  assert.deepEqual(claim({ now: oneMsLate }), { eligible: false, reason: "too_late" });
});

test("the guarantee only covers the first lesson with a tutor", () => {
  assert.equal(claim({ completedSessionsWithTutor: config.maxCompletedSessions }).eligible, true);
  assert.deepEqual(claim({ completedSessionsWithTutor: config.maxCompletedSessions + 1 }), {
    eligible: false,
    reason: "sessions_exceeded",
  });
});

test("one claim per booking", () => {
  assert.deepEqual(claim({ alreadyClaimed: true }), { eligible: false, reason: "already_claimed" });
});

test("the published numbers come from the same config the decision uses", () => {
  const summary = guaranteeSummary(config);
  assert.equal(summary.claimWindowHours, config.claimWindowHours);
  assert.equal(summary.replacementSessions, config.replacementSessions);
  // A zero-session remedy would publish a guarantee that gives away nothing.
  assert.ok(summary.replacementSessions >= 1);
});
