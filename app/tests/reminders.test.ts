import test from "node:test";
import assert from "node:assert/strict";

import { HOUR_MS, REMINDER_WINDOWS, dueReminders, scanWindow, type ReminderCandidate } from "@/lib/reminders/rules";

/**
 * Reminder rules (§18).
 *
 * The guarantee that matters in production is "a reminder fires once, in its
 * window, and never after the lesson has started" - the job may run twice, may
 * run late, and may find several bookings at once.
 */
const now = new Date("2026-09-20T12:00:00Z");

function candidate(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    bookingId: "b1",
    code: "EDU-20092026-0001",
    startsAt: new Date(now.getTime() + 3 * HOUR_MS),
    status: "scheduled",
    completedAt: null,
    hasReview: false,
    sentTypes: [],
    ...overrides,
  };
}

test("three hours out, the day-before reminder is due and the 2h one is not", () => {
  const due = dueReminders(candidate(), now);
  assert.deepEqual(due.map((item) => item.type), ["reminder.lesson_24h"]);
  // dueAt records when the window opened, not when the job happened to run.
  assert.equal(due[0]!.dueAt.getTime(), candidate().startsAt.getTime() - 24 * HOUR_MS);
});

test("both reminders are due inside the 24h window, newest window first", () => {
  const due = dueReminders(candidate({ startsAt: new Date(now.getTime() + HOUR_MS) }), now);
  assert.deepEqual(due.map((item) => item.type).sort(), ["reminder.lesson_24h", "reminder.lesson_2h"]);
  assert.equal(due.length, REMINDER_WINDOWS.length);
});

test("a reminder already sent is never sent again", () => {
  const due = dueReminders(
    candidate({ startsAt: new Date(now.getTime() + HOUR_MS), sentTypes: ["reminder.lesson_24h"] }),
    now,
  );
  assert.deepEqual(due.map((item) => item.type), ["reminder.lesson_2h"]);
});

test("a late job still delivers, but a started lesson is left alone", () => {
  // The window opened 40 minutes ago: the job was down, and this is still useful.
  const late = dueReminders(candidate({ startsAt: new Date(now.getTime() + 80 * 60_000) }), now);
  assert.ok(late.some((item) => item.type === "reminder.lesson_2h"));

  // The lesson began 5 minutes ago: "starting in 2 hours" would be a lie.
  const started = dueReminders(candidate({ startsAt: new Date(now.getTime() - 5 * 60_000), status: "in_progress" }), now);
  assert.deepEqual(started, []);
});

test("only reservations that will actually happen are reminded", () => {
  for (const status of ["pending_payment", "cancelled", "rejected", "refunded", "completed"] as const) {
    assert.deepEqual(
      dueReminders(candidate({ status, startsAt: new Date(now.getTime() + HOUR_MS) }), now),
      [],
      status,
    );
  }
});

test("the review request waits, fires once, and stops when a review exists", () => {
  const justCompleted = new Date(now.getTime() - 30 * 60_000);
  assert.deepEqual(
    dueReminders(candidate({ status: "completed", completedAt: justCompleted, startsAt: new Date(now.getTime() - HOUR_MS) }), now),
    [],
  );

  const older = new Date(now.getTime() - 5 * HOUR_MS);
  const due = dueReminders(candidate({ status: "completed", completedAt: older, startsAt: older }), now);
  assert.deepEqual(due.map((item) => item.type), ["review.requested"]);

  assert.deepEqual(
    dueReminders(candidate({ status: "completed", completedAt: older, hasReview: true, startsAt: older }), now),
    [],
  );
  assert.deepEqual(
    dueReminders(
      candidate({ status: "completed", completedAt: older, startsAt: older, sentTypes: ["review.requested"] }),
      now,
    ),
    [],
  );
});

test("the scan window is bounded and recovers a missed day", () => {
  const { from, to } = scanWindow(now);
  assert.ok(from.getTime() < now.getTime());
  assert.ok(to.getTime() > now.getTime());
  // Wide enough to catch a booking made for tomorrow, narrow enough not to
  // scan the whole table.
  assert.ok(to.getTime() - now.getTime() <= 26 * HOUR_MS);
  assert.ok(now.getTime() - from.getTime() <= 4 * 24 * HOUR_MS);
});
