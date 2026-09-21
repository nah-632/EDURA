/**
 * Reminder dispatcher (§18).
 *
 * `runReminderJob` is the whole scheduled workload: lesson reminders, the
 * post-lesson review request, and the subscription-expiry warning. It is
 * idempotent - running it twice, or from two instances at once, sends nothing
 * twice, because every send is decided against the notification rows already
 * written for that booking or subscription.
 *
 * Booking timestamps are stored as wall-clock Bahrain time (`timestamp`), so
 * every comparison against "now" converts explicitly with
 * `at time zone 'Asia/Bahrain'`. Comparing the raw column against now() would
 * silently use the server's UTC offset and fire reminders three hours early.
 */
import { query, queryOne } from "@/lib/db";
import { notifyMany } from "@/lib/notifications/service";
import { dueReminders, scanWindow, type ReminderCandidate } from "./rules";
import { DAY_MS, shouldWarnExpiry, subscriptionPhase, daysRemaining } from "@/lib/subscriptions/rules";
import type { BookingStatus } from "@/lib/booking/state";

export interface ReminderRunResult {
  scanned: number;
  delivered: number;
  byType: Record<string, number>;
}

interface BookingScanRow {
  id: string;
  code: string;
  status: BookingStatus;
  starts_at: Date;
  completed_at: Date | null;
  customer_user_id: string;
  tutor_user_id: string;
  sent_types: string[] | null;
  has_review: boolean;
}

export async function runReminderJob(now: Date = new Date()): Promise<ReminderRunResult> {
  const { from, to } = scanWindow(now);
  const rows = await query<BookingScanRow>(
    `select b.id, b.code, b.status,
            (b.starts_at at time zone 'Asia/Bahrain') as starts_at,
            b.completed_at,
            b.customer_user_id,
            t.user_id as tutor_user_id,
            (select array_agg(distinct n.type) from notifications n
              where n.entity_type = 'booking' and n.entity_id = b.id) as sent_types,
            exists (select 1 from reviews r where r.booking_id = b.id) as has_review
       from bookings b
       join tutors t on t.id = b.tutor_id
      where b.status in ('paid','confirmed','tutor_accepted','scheduled','in_progress','completed')
        and (
          (b.starts_at at time zone 'Asia/Bahrain') between $1 and $2
          or (b.status = 'completed' and b.completed_at is not null and b.completed_at >= $3)
        )`,
    [from.toISOString(), to.toISOString(), new Date(now.getTime() - 3 * DAY_MS).toISOString()],
  );

  const result: ReminderRunResult = { scanned: rows.length, delivered: 0, byType: {} };

  for (const row of rows) {
    const candidate: ReminderCandidate = {
      bookingId: row.id,
      code: row.code,
      startsAt: new Date(row.starts_at as unknown as string),
      status: row.status,
      completedAt: row.completed_at,
      hasReview: row.has_review,
      sentTypes: row.sent_types ?? [],
    };
    for (const reminder of dueReminders(candidate, now)) {
      // The review request goes to the person who can write it; lesson
      // reminders go to both sides of the lesson.
      const recipients =
        reminder.type === "review.requested"
          ? [row.customer_user_id]
          : [row.customer_user_id, row.tutor_user_id];
      const delivery = await notifyMany(recipients, reminder.type, { code: row.code }, {
        type: "booking",
        id: row.id,
      });
      result.delivered += delivery.sent;
      result.byType[reminder.type] = (result.byType[reminder.type] ?? 0) + delivery.sent;
    }
  }

  return result;
}

export interface ExpiryRunResult {
  warned: number;
  expired: number;
}

/**
 * Subscription expiry job.
 *
 * Two distinct actions, deliberately separate:
 *  - WARN: a tutor inside the last week of an active subscription is told once
 *    a day. Warning never changes state.
 *  - EXPIRE: past the grace period the subscription is marked expired AND the
 *    tutor's listing status becomes `expired_subscription`. The search view
 *    already excludes them, so this is about telling the truth in the tutor's
 *    own dashboard rather than leaving it showing "approved" forever.
 */
export async function runSubscriptionExpiryJob(now: Date = new Date()): Promise<ExpiryRunResult> {
  const rows = await query<{
    id: string;
    tutor_id: string;
    status: "pending" | "active" | "expired" | "cancelled";
    expires_at: Date | null;
    grace_until: Date | null;
    tutor_user_id: string;
    last_warned_at: Date | null;
  }>(
    `select s.id, s.tutor_id, s.status, s.expires_at, s.grace_until,
            t.user_id as tutor_user_id,
            (select max(n.created_at) from notifications n
              where n.user_id = t.user_id and n.type = 'subscription.expiring') as last_warned_at
       from subscriptions s
       join tutors t on t.id = s.tutor_id
      where s.status = 'active'`,
  );

  let warned = 0;
  let expired = 0;

  for (const row of rows) {
    const shape = { status: row.status, startsAt: null, expiresAt: row.expires_at, graceUntil: row.grace_until };
    const phase = subscriptionPhase(shape, now);

    if (phase === "expired") {
      const updated = await query<{ id: string }>(
        `update subscriptions set status = 'expired'
          where id = $1 and status = 'active' returning id`,
        [row.id],
      );
      if (updated.length > 0) {
        expired += 1;
        await query(
          `update tutors set status = 'expired_subscription'
            where id = $1 and status = 'approved'`,
          [row.tutor_id],
        );
        await notifyMany([row.tutor_user_id], "subscription.expired", {}, {
          type: "subscription",
          id: row.id,
        });
      }
      continue;
    }

    const daysLeft = daysRemaining(shape, now);
    // `shouldWarnExpiry` owns the whole rule, including "at most once a day",
    // so the job can run hourly without repeating itself.
    if (shouldWarnExpiry({ phase, daysLeft, lastWarnedAt: row.last_warned_at, now })) {
      await notifyMany([row.tutor_user_id], "subscription.expiring", { days: daysLeft }, {
        type: "subscription",
        id: row.id,
      });
      warned += 1;
    }
  }

  return { warned, expired };
}

/** Health probe used by the cron route to report what it would do. */
export async function reminderJobPreview(now: Date = new Date()): Promise<{ pendingBookings: number }> {
  const row = await queryOne<{ count: string }>(
    `select count(*)::text as count
       from bookings
      where status in ('paid','confirmed','tutor_accepted','scheduled','in_progress')
        and (starts_at at time zone 'Asia/Bahrain') between $1 and $2`,
    [now.toISOString(), new Date(now.getTime() + 25 * 3_600_000).toISOString()],
  );
  return { pendingBookings: Number(row?.count ?? 0) };
}
