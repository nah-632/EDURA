/**
 * Guarantee rules (addendum §C).
 *
 * The commercial terms of the guarantee are a BUSINESS decision, so they live
 * in platform settings and the outcome is computed here - not written into the
 * marketing page. Changing "48 hours" or "one replacement lesson" is an admin
 * edit in the console, and the same numbers render on the guarantee page, in
 * the homepage badge and in the claim decision, because they all read this
 * function.
 *
 * The verifiability part of the guarantee (meaning: the platform only lists
 * tutors whose documents were reviewed, and only confirms bookings after an
 * admin verified the payment) is not configurable - it is how the state
 * machines work, so it cannot be switched off by a setting.
 */
import type { BookingStatus } from "@/lib/booking/state";

export interface GuaranteeConfig {
  /** master switch for the satisfaction/replacement part */
  satisfactionEnabled: boolean;
  /** hours after the lesson ends during which a claim is accepted */
  claimWindowHours: number;
  /** maximum lessons already completed with the same tutor for a claim to hold */
  maxCompletedSessions: number;
  /** lessons or credit offered when a claim is accepted */
  replacementSessions: number;
}

export const DEFAULT_GUARANTEE: GuaranteeConfig = {
  satisfactionEnabled: true,
  claimWindowHours: 48,
  maxCompletedSessions: 1,
  replacementSessions: 1,
};

export type GuaranteeRemedy = "replacement_tutor" | "session_credit";

export type ClaimReason =
  | "guarantee_disabled"
  | "not_completed"
  | "too_late"
  | "sessions_exceeded"
  | "already_claimed";

export type ClaimDecision =
  | {
      eligible: true;
      remedy: GuaranteeRemedy;
      /** what the platform will actually do, in configurable units */
      sessions: number;
    }
  | { eligible: false; reason: ClaimReason };

export interface ClaimInput {
  bookingStatus: BookingStatus;
  lessonEndedAt: Date | null;
  /** lessons already completed with this tutor by this customer */
  completedSessionsWithTutor: number;
  /** the customer already raised a claim on this booking */
  alreadyClaimed: boolean;
  /** the customer's stated preference; the remedy follows eligibility */
  preferCredit?: boolean;
  now: Date;
}

const HOUR_MS = 3_600_000;

/**
 * Decide a claim. Kept pure so the eligibility rules can be proven in a unit
 * test rather than discovered in production.
 *
 * Order matters: the state of the booking is checked before the clock, because
 * "this lesson has not happened yet" is a more useful answer than "you are
 * early", and neither should ever be reported for a booking that is cancelled.
 */
export function evaluateClaim(config: GuaranteeConfig, input: ClaimInput): ClaimDecision {
  if (!config.satisfactionEnabled) return { eligible: false, reason: "guarantee_disabled" };
  if (input.alreadyClaimed) return { eligible: false, reason: "already_claimed" };
  if (input.bookingStatus !== "completed" || !input.lessonEndedAt) {
    return { eligible: false, reason: "not_completed" };
  }
  const elapsed = input.now.getTime() - input.lessonEndedAt.getTime();
  if (elapsed > config.claimWindowHours * HOUR_MS) return { eligible: false, reason: "too_late" };
  if (input.completedSessionsWithTutor > config.maxCompletedSessions) {
    return { eligible: false, reason: "sessions_exceeded" };
  }
  return {
    eligible: true,
    remedy: input.preferCredit ? "session_credit" : "replacement_tutor",
    sessions: Math.max(1, config.replacementSessions),
  };
}

/**
 * The numbers rendered on the guarantee page and in the homepage badge. They
 * come from the same config the decision uses, so the published promise and the
 * enforced rule cannot disagree.
 */
export function guaranteeSummary(config: GuaranteeConfig): {
  claimWindowHours: number;
  replacementSessions: number;
  maxCompletedSessions: number;
} {
  return {
    claimWindowHours: config.claimWindowHours,
    replacementSessions: Math.max(1, config.replacementSessions),
    maxCompletedSessions: config.maxCompletedSessions,
  };
}
