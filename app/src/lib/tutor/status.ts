/**
 * Tutor status union — mirrors the `tutor_status` database enum.
 *
 * The database enforces this set, so application code should carry the union
 * rather than `string`: a screen that offers status transitions needs the
 * compiler to catch a value the state machine cannot accept (see
 * docs/09-build-verification-report.md §7 for the incident this rule comes from).
 */
export const tutorStatuses = [
  "pending",
  "under_review",
  "approved",
  "rejected",
  "suspended",
  "expired_subscription",
] as const;

export type TutorStatus = (typeof tutorStatuses)[number];

/** Statuses that mean the profile is publicly visible (with a live subscription). */
export function isApprovedStatus(status: TutorStatus): boolean {
  return status === "approved";
}

/** Statuses a tutor may still edit their way out of. */
export function isOpenStatus(status: TutorStatus): boolean {
  return status === "pending" || status === "under_review" || status === "rejected";
}
