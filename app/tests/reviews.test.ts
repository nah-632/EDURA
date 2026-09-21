import test from "node:test";
import assert from "node:assert/strict";

import { aggregateRating, moderationTarget, reviewBlockReason } from "@/lib/reviews/rules";

/**
 * Review rules (§19). The three blocks named in the directive are proven here
 * so the enforcement in the service cannot regress silently.
 */
test("only the customer of a completed booking can review it", () => {
  const base = {
    bookingStatus: "completed" as const,
    bookingCustomerUserId: "u1",
    requestUserId: "u1",
    hasExistingReview: false,
  };
  assert.equal(reviewBlockReason(base), null);
  assert.equal(reviewBlockReason({ ...base, requestUserId: "u2" }), "not_your_booking");
});

test("cancelled and in-flight bookings cannot be reviewed", () => {
  const base = {
    bookingStatus: "completed" as const,
    bookingCustomerUserId: "u1",
    requestUserId: "u1",
    hasExistingReview: false,
  };
  for (const status of ["pending_payment", "confirmed", "scheduled", "in_progress", "cancelled", "refunded"] as const) {
    assert.equal(reviewBlockReason({ ...base, bookingStatus: status }), "not_completed", status);
  }
});

test("a booking accepts exactly one review", () => {
  assert.equal(
    reviewBlockReason({
      bookingStatus: "completed",
      bookingCustomerUserId: "u1",
      requestUserId: "u1",
      hasExistingReview: true,
    }),
    "already_reviewed",
  );
});

test("moderation moves are declared edges, not free-form status writes", () => {
  assert.equal(moderationTarget("publish", "pending"), "published");
  assert.equal(moderationTarget("publish", "reported"), "published");
  assert.equal(moderationTarget("hide", "published"), "hidden");
  assert.equal(moderationTarget("restore", "hidden"), "published");
  assert.equal(moderationTarget("report", "published"), "reported");
  // Nothing can return to "pending": a decided review stays decided.
  assert.equal(moderationTarget("publish", "published"), null);
  assert.equal(moderationTarget("hide", "hidden"), null);
  assert.equal(moderationTarget("restore", "published"), null);
});

test("the rating aggregate ignores unpublished reviews by construction", () => {
  assert.deepEqual(aggregateRating([]), { avg: "0.00", count: 0 });
  assert.deepEqual(aggregateRating([5]), { avg: "5.00", count: 1 });
  assert.deepEqual(aggregateRating([5, 4]), { avg: "4.50", count: 2 });
  // Hiding one of three reviews must move the number, not leave it stranded.
  assert.deepEqual(aggregateRating([5, 3]), { avg: "4.00", count: 2 });
});
