/**
 * Booking reminder rules (§18).
 *
 * The scheduling itself belongs to whatever runs the job (a cron route, or an
 * external scheduler), so this module decides only WHICH reminder is due - and
 * it is pure, so the "already sent" guarantee is testable without a database.
 *
 * Three reminders exist:
 *   reminder.lesson_24h  - the day before
 *   reminder.lesson_2h   - two hours before
 *   review.requested     - after a completed lesson, once
 *
 * Idempotency is by (booking, type): the dispatcher reads the notification
 * types already written for a booking and passes them in, and any type already
 * present is never emitted again. A job that runs twice, or two instances that
 * overlap, therefore cannot double-notify.
 */
import type { BookingStatus } from "@/lib/booking/state";

export const HOUR_MS = 3_600_000;

export interface ReminderWindow {
  type: "reminder.lesson_24h" | "reminder.lesson_2h";
  hoursBefore: number;
}

export const REMINDER_WINDOWS: readonly ReminderWindow[] = [
  { type: "reminder.lesson_24h", hoursBefore: 24 },
  { type: "reminder.lesson_2h", hoursBefore: 2 },
];

/** Statuses whose lesson is genuinely going to happen. */
export const reminderStatuses: BookingStatus[] = [
  "paid",
  "confirmed",
  "tutor_accepted",
  "scheduled",
  "in_progress",
];

export interface ReminderCandidate {
  bookingId: string;
  code: string;
  startsAt: Date;
  status: BookingStatus;
  completedAt?: Date | null;
  hasReview?: boolean;
  /** notification types already written for this booking */
  sentTypes: readonly string[];
}

export interface DueReminder {
  type: "reminder.lesson_24h" | "reminder.lesson_2h" | "review.requested";
  bookingId: string;
  code: string;
  /** when it became due - used to order dispatch and to explain the log */
  dueAt: Date;
}

/** How long after a completion the review request goes out. */
export const REVIEW_REQUEST_DELAY_MS = 2 * HOUR_MS;

/**
 * A reminder is due once its window has opened and while the lesson is still in
 * the future. Late is fine (a job that was down for an hour still delivers the
 * 24h reminder), but a reminder for a lesson that has already started is
 * dropped: notifying "your lesson is in 2 hours" after it began is worse than
 * silence.
 */
export function dueReminders(candidate: ReminderCandidate, now: Date): DueReminder[] {
  const due: DueReminder[] = [];
  const sent = new Set(candidate.sentTypes);

  if (reminderStatuses.includes(candidate.status)) {
    const msUntil = candidate.startsAt.getTime() - now.getTime();
    if (msUntil > 0) {
      for (const window of REMINDER_WINDOWS) {
        if (sent.has(window.type)) continue;
        if (msUntil <= window.hoursBefore * HOUR_MS) {
          due.push({
            type: window.type,
            bookingId: candidate.bookingId,
            code: candidate.code,
            dueAt: new Date(candidate.startsAt.getTime() - window.hoursBefore * HOUR_MS),
          });
        }
      }
    }
  }

  if (candidate.status === "completed" && candidate.completedAt && !candidate.hasReview) {
    if (!sent.has("review.requested") && now.getTime() - candidate.completedAt.getTime() >= REVIEW_REQUEST_DELAY_MS) {
      due.push({
        type: "review.requested",
        bookingId: candidate.bookingId,
        code: candidate.code,
        dueAt: new Date(candidate.completedAt.getTime() + REVIEW_REQUEST_DELAY_MS),
      });
    }
  }

  return due;
}

/**
 * The window a single job run scans. Deliberately wider than the hourly cadence
 * so a missed run is recovered rather than lost, while still bounded so the
 * query never table-scans the whole bookings table.
 */
export function scanWindow(now: Date, lookAheadHours = 25, lookBackDays = 3): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() - lookBackDays * 24 * HOUR_MS),
    to: new Date(now.getTime() + lookAheadHours * HOUR_MS),
  };
}
