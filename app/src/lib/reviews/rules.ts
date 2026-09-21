/**
 * Review rules (§19).
 *
 * Kept pure and separate from SQL so the three blocks the directive names -
 * no review before completion, no review on a cancelled booking, no duplicate
 * review per booking - are provable in a unit test without a database. The
 * database additionally enforces the duplicate rule with a unique index on
 * `reviews.booking_id`, so the rule holds even under a race.
 */
import type { BookingStatus } from "@/lib/booking/state";

export type ReviewBlock = "not_completed" | "already_reviewed" | "not_your_booking" | null;

export interface ReviewEligibility {
  bookingStatus: BookingStatus;
  bookingCustomerUserId: string;
  requestUserId: string;
  hasExistingReview: boolean;
}

export function reviewBlockReason(input: ReviewEligibility): ReviewBlock {
  if (input.bookingCustomerUserId !== input.requestUserId) return "not_your_booking";
  // A cancelled or rejected booking never yields a review, even if it once
  // reached "completed" (a refund can move it out of the reviewable state).
  if (input.bookingStatus !== "completed") return "not_completed";
  if (input.hasExistingReview) return "already_reviewed";
  return null;
}

export const reviewModerationActions = ["publish", "hide", "restore", "report"] as const;
export type ReviewModerationAction = (typeof reviewModerationActions)[number];

export const reviewStatuses = ["pending", "published", "hidden", "reported"] as const;
export type ReviewStatus = (typeof reviewStatuses)[number];

/**
 * Legal moderation edges. Publishing from `reported` is allowed because
 * "reported" is a queue flag, not a verdict; restoring from `hidden` is the
 * inverse action of hiding. Nothing can move back to `pending`: that state only
 * ever exists before the first decision, and a review that was decided keeps a
 * decision (a moderator who changes their mind hides or restores it, and the
 * audit log tells the story).
 */
const MODERATION_EDGES: Record<ReviewModerationAction, ReviewStatus[]> = {
  publish: ["pending", "hidden", "reported"],
  hide: ["published", "pending", "reported"],
  restore: ["hidden"],
  report: ["published", "pending"],
};

const TARGET: Record<ReviewModerationAction, ReviewStatus> = {
  publish: "published",
  hide: "hidden",
  restore: "published",
  report: "reported",
};

export function moderationTarget(action: ReviewModerationAction, current: ReviewStatus): ReviewStatus | null {
  return MODERATION_EDGES[action].includes(current) ? TARGET[action] : null;
}

/**
 * Rating aggregate. The authoritative value is recomputed in SQL from the
 * published rows (see recomputeTutorRating), but the same arithmetic is
 * expressed here so the console can show what a moderation decision will do to
 * the tutor's visible rating, and so the rule is unit-tested.
 */
export function aggregateRating(ratings: number[]): { avg: string; count: number } {
  if (ratings.length === 0) return { avg: "0.00", count: 0 };
  const sum = ratings.reduce((acc, value) => acc + value, 0);
  return { avg: (sum / ratings.length).toFixed(2), count: ratings.length };
}

/** SQL that recomputes a tutor's rating from published reviews only. */
export const RECOMPUTE_RATING_SQL = `
  update tutors t
     set rating_avg = coalesce(agg.avg, 0),
         rating_count = coalesce(agg.cnt, 0)
    from (
      select avg(rating)::numeric(3,2) as avg, count(*)::int as cnt
        from reviews where tutor_id = $1 and status = 'published'
    ) agg
   where t.id = $1
`;
