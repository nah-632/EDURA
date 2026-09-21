/**
 * Data retention policy (§25), expressed once so the legal page, the account
 * screen and the deletion routine cannot describe three different policies.
 *
 * The distinction that matters to a customer is WHAT is deleted and WHAT is
 * kept, and why. The values below are the ones the legal text quotes; the
 * numbers are constants rather than prose so a change is a one-line change that
 * the tests enforce.
 */
export const RETENTION = {
  /** Booking and payment records are kept for financial/audit review. */
  bookingAndPaymentYears: 7,
  /** Tutor verification documents are removed after the relationship ends. */
  tutorDocumentsDaysAfterRelationship: 90,
  /** A deleted account can still be queried with support during this window. */
  accountRecoveryDays: 30,
  /** In-app notifications are the user's own inbox, not a financial record. */
  notificationsOnDeletion: "deleted",
  /** Sessions are always revoked on deletion. */
  sessionsOnDeletion: "revoked",
} as const;

export interface DeletionPlan {
  /** tables whose rows are removed or anonymised outright */
  removed: string[];
  /** tables kept for legal/financial reasons, with the reason */
  retained: { table: string; reason: string; until: string }[];
}

/**
 * What a deletion actually does. Rendered on the account page BEFORE the user
 * confirms, so "delete my account" is an informed action rather than a button
 * that surprises them afterwards.
 */
export function deletionPlan(now: Date = new Date()): DeletionPlan {
  const until = new Date(
    now.getFullYear() + RETENTION.bookingAndPaymentYears,
    now.getMonth(),
    now.getDate(),
  );
  return {
    removed: ["profile name and contact details", "student records", "notifications", "active sessions"],
    retained: [
      {
        table: "bookings",
        reason: "financial and dispute record; personal notes and address are cleared",
        until: `${until.getFullYear()}`,
      },
      {
        table: "payments",
        reason: "financial audit trail and refund reconciliation",
        until: `${until.getFullYear()}`,
      },
      {
        table: "audit_logs",
        reason: "security trail of administrative actions (no personal content)",
        until: "indefinite",
      },
    ],
  };
}

/** The placeholder identities used when anonymising, kept in one place. */
export const ANONYMISED = {
  fullName: "حساب محذوف",
  fullNameEn: "Deleted account",
  studentName: "طالب محذوف",
  studentNameEn: "Deleted student",
  emailPrefix: "deleted+",
  emailDomain: "edura.invalid",
} as const;
