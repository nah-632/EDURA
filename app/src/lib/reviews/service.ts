/**
 * Review service (§19).
 *
 * A review can only be written by the customer of a COMPLETED booking, and only
 * once. Both rules are decided by the pure `reviewBlockReason` and then enforced
 * again by the database (unique index on booking_id), so a double submit from a
 * double-tapped button loses a race to the index instead of creating a second
 * review.
 *
 * Whether a new review needs moderation is a platform setting, not a constant:
 * with moderation on it starts `pending` and does not affect the tutor's visible
 * rating until an admin publishes it.
 */
import { query, queryOne } from "@/lib/db";
import { notifyUser } from "@/lib/notifications/service";
import { writeAudit } from "@/lib/security/audit";
import { getSettings } from "@/lib/settings";
import type { BookingStatus } from "@/lib/booking/state";
import { RECOMPUTE_RATING_SQL, reviewBlockReason, type ReviewStatus } from "./rules";

export interface CreateReviewInput {
  bookingId: string;
  rating: number;
  comment?: string | null;
  categories?: Record<string, number>;
}

export interface CreatedReview {
  id: string;
  status: ReviewStatus;
  tutorId: string;
}

export async function createReview(
  userId: string,
  input: CreateReviewInput,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<CreatedReview> {
  const booking = await queryOne<{
    id: string;
    status: BookingStatus;
    customer_user_id: string;
    tutor_id: string;
    tutor_user_id: string;
  }>(
    `select b.id, b.status, b.customer_user_id, b.tutor_id, t.user_id as tutor_user_id
       from bookings b join tutors t on t.id = b.tutor_id
      where b.id = $1`,
    [input.bookingId],
  );
  if (!booking) throw new Error("not_found");

  const existing = await queryOne<{ id: string }>(`select id from reviews where booking_id = $1`, [input.bookingId]);
  const block = reviewBlockReason({
    bookingStatus: booking.status,
    bookingCustomerUserId: booking.customer_user_id,
    requestUserId: userId,
    hasExistingReview: Boolean(existing),
  });
  if (block) throw new Error(block);

  const settings = await getSettings();
  const status: ReviewStatus = settings.reviewModeration ? "pending" : "published";

  const rows = await query<{ id: string }>(
    `insert into reviews (booking_id, tutor_id, author_user_id, rating, comment, categories, status)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7)
     returning id`,
    [
      input.bookingId,
      booking.tutor_id,
      userId,
      input.rating,
      input.comment?.trim() || null,
      JSON.stringify(input.categories ?? {}),
      status,
    ],
  );
  const reviewId = rows[0]!.id;

  if (status === "published") {
    await query(RECOMPUTE_RATING_SQL, [booking.tutor_id]);
    // The author is told their review is live; the tutor is NOT notified on
    // submission, so a pending review cannot be used to pressure them.
    await notifyUser(userId, "review.published", {}, { type: "review", id: reviewId });
  }

  await writeAudit({
    actorUserId: userId,
    actorLabel: null,
    action: "review.created",
    entity: "reviews",
    entityId: reviewId,
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
    after: { booking: input.bookingId, rating: input.rating, status },
  });

  return { id: reviewId, status, tutorId: booking.tutor_id };
}

/** Reviews shown on a tutor's public profile: published only. */
export async function listTutorReviews(
  tutorId: string,
  limit = 20,
): Promise<{ id: string; rating: number; comment: string | null; createdAt: Date; studentName: string }[]> {
  const rows = await query<{
    id: string;
    rating: number;
    comment: string | null;
    created_at: Date;
    display_name: string | null;
  }>(
    `select r.id, r.rating, r.comment, r.created_at,
            coalesce(nullif(p.display_name, ''), '') as display_name
       from reviews r
       join users u on u.id = r.author_user_id
       left join user_profiles p on p.user_id = u.id
      where r.tutor_id = $1 and r.status = 'published'
      order by r.created_at desc
      limit $2`,
    [tutorId, Math.min(Math.max(limit, 1), 50)],
  );
  return rows.map((row) => ({
    // The author's full name is never published: the review belongs to the
    // tutor, and a review section is not a place to expose customer identities.
    studentName: row.display_name?.trim() ? maskName(row.display_name) : "",
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
  }));
}

function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? "";
  return first.length > 1 ? `${first.slice(0, 1)}${"•".repeat(Math.max(first.length - 1, 1))}` : first;
}

export interface ModerationOutcome {
  reviewId: string;
  status: ReviewStatus;
  tutorId: string;
  authorUserId: string;
}

/**
 * Apply a moderation decision. The rating is recomputed from the published rows
 * inside the same call, so a hidden review can never keep inflating a tutor's
 * rating.
 */
export async function applyModeration(params: {
  reviewId: string;
  status: ReviewStatus;
  moderatedBy: string;
  note?: string | null;
}): Promise<ModerationOutcome> {
  const updated = await query<{ tutor_id: string; author_user_id: string }>(
    `update reviews
        set status = $2, moderated_by = $3, moderated_at = now(), moderation_note = $4
      where id = $1
      returning tutor_id, author_user_id`,
    [params.reviewId, params.status, params.moderatedBy, params.note?.trim() || null],
  );
  const row = updated[0];
  if (!row) throw new Error("not_found");
  await query(RECOMPUTE_RATING_SQL, [row.tutor_id]);
  return { reviewId: params.reviewId, status: params.status, tutorId: row.tutor_id, authorUserId: row.author_user_id };
}

/** The customer's own review for a booking, if it exists (used by the UI state). */
export async function findReviewForBooking(bookingId: string): Promise<{ id: string; status: ReviewStatus } | null> {
  return queryOne<{ id: string; status: ReviewStatus }>(`select id, status from reviews where booking_id = $1`, [
    bookingId,
  ]);
}
