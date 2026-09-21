/**
 * Booking actions performed by the two parties who own them (§12, §41).
 *
 * Both go through the SAME state machine the admin console uses, with the actor
 * set to `customer` or `tutor`, so a customer cannot perform a tutor's
 * transition even by crafting a request - the legality check is on the actor,
 * not on the endpoint.
 *
 * The cancellation policy is evaluated here and encoded in the reason that
 * lands in `bookings.cancel_reason` and the audit row, which is how an operator
 * can later tell an on-time cancellation from a late one without a second
 * table.
 */
import { query, queryOne } from "@/lib/db";
import { getBookingSettings } from "@/lib/settings";
import { notifyMany } from "@/lib/notifications/service";
import { videoProvider } from "@/lib/providers";
import { bookingStoreAvailable, SqlBookingStore } from "@/lib/booking/sqlStore";
import { transitionBooking } from "@/lib/booking/engine";
import { canTransition, type BookingStatus } from "@/lib/booking/state";
import { bahrainInstant } from "@/lib/booking/datetime";

export class BookingActionError extends Error {
  constructor(
    readonly code: "not_found" | "invalid_transition" | "policy" | "not_configured",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "BookingActionError";
  }
}

interface PartyBooking {
  id: string;
  code: string;
  status: BookingStatus;
  scheduled_date: string;
  start_time: string;
  customer_user_id: string;
  tutor_user_id: string;
  tutor_id: string;
}

async function loadForCustomer(userId: string, idOrCode: string): Promise<PartyBooking> {
  const row = await queryOne<PartyBooking>(
    `select b.id, b.code, b.status, b.scheduled_date::text as scheduled_date,
            to_char(b.start_time, 'HH24:MI') as start_time,
            b.customer_user_id, t.user_id as tutor_user_id, b.tutor_id
       from bookings b join tutors t on t.id = b.tutor_id
      where b.customer_user_id = $1 and (b.id::text = $2 or b.code = $2)`,
    [userId, idOrCode],
  );
  if (!row) throw new BookingActionError("not_found");
  return row;
}

async function loadForTutor(tutorId: string, idOrCode: string): Promise<PartyBooking> {
  const row = await queryOne<PartyBooking>(
    `select b.id, b.code, b.status, b.scheduled_date::text as scheduled_date,
            to_char(b.start_time, 'HH24:MI') as start_time,
            b.customer_user_id, t.user_id as tutor_user_id, b.tutor_id
       from bookings b join tutors t on t.id = b.tutor_id
      where b.tutor_id = $1 and (b.id::text = $2 or b.code = $2)`,
    [tutorId, idOrCode],
  );
  if (!row) throw new BookingActionError("not_found");
  return row;
}

function store(): SqlBookingStore {
  if (!bookingStoreAvailable()) throw new BookingActionError("not_configured");
  return new SqlBookingStore();
}

export interface CancelResult {
  bookingId: string;
  status: BookingStatus;
  /** true when the lesson was inside the platform's cancellation window */
  late: boolean;
  note: string;
}

/**
 * Customer cancels. The policy verdict (late/on-time) is computed from the
 * configured window and recorded with the change; whether that implies a refund
 * is an admin decision, so this never promises money back on its own.
 */
export async function cancelBookingAsCustomer(userId: string, idOrCode: string): Promise<CancelResult> {
  const booking = await loadForCustomer(userId, idOrCode);
  if (!canTransition(booking.status, "cancelled", "customer")) {
    throw new BookingActionError("invalid_transition");
  }
  const settings = await getBookingSettings();
  const startsAt = bahrainInstant(booking.scheduled_date, booking.start_time);
  const hoursUntil = (startsAt.getTime() - Date.now()) / 3_600_000;
  const late = hoursUntil < settings.cancellationHours;
  const note = late ? "customer_cancelled_late" : "customer_cancelled_ontime";

  await transitionBooking(store(), {
    bookingId: booking.id,
    to: "cancelled",
    actor: "customer",
    actorUserId: userId,
    reason: note,
  });

  await notifyMany(
    late ? [booking.customer_user_id, booking.tutor_user_id] : [booking.tutor_user_id],
    "booking.cancelled",
    { code: booking.code, reason: note },
    { type: "booking", id: booking.id },
  );

  return { bookingId: booking.id, status: "cancelled", late, note };
}

/** Customer asks for a refund; the admin decides (payment.refund). */
export async function requestRefundAsCustomer(userId: string, idOrCode: string, reason: string): Promise<void> {
  const booking = await loadForCustomer(userId, idOrCode);
  if (!canTransition(booking.status, "refund_requested", "customer")) {
    throw new BookingActionError("invalid_transition");
  }
  await transitionBooking(store(), {
    bookingId: booking.id,
    to: "refund_requested",
    actor: "customer",
    actorUserId: userId,
    reason: reason.slice(0, 500),
  });
}

export interface TutorDecision {
  bookingId: string;
  status: BookingStatus;
}

/**
 * Tutor accepts or declines a request. Declining is only offered when the
 * platform allows it (§41 `allowTutorDecline`); a tutor cannot decline a lesson
 * the customer already paid for and that the platform confirmed, which is why
 * the allowed target is `rejected` from `confirmed` and nothing else.
 */
export async function decideBookingAsTutor(
  tutorId: string,
  idOrCode: string,
  decision: "accept" | "decline",
  reason?: string | null,
): Promise<TutorDecision> {
  const booking = await loadForTutor(tutorId, idOrCode);
  const settings = await getBookingSettings();

  if (decision === "decline" && !settings.allowTutorDecline) {
    throw new BookingActionError("policy");
  }

  const to: BookingStatus = decision === "accept" ? "tutor_accepted" : "rejected";
  if (!canTransition(booking.status, to, "tutor")) {
    throw new BookingActionError("invalid_transition");
  }

  const tutor = await queryOne<{ id: string; user_id: string }>(
    `select id, user_id from tutors where id = $1`,
    [tutorId],
  );
  if (!tutor) throw new BookingActionError("not_found");

  await transitionBooking(store(), {
    bookingId: booking.id,
    to,
    actor: "tutor",
    actorUserId: tutor.user_id,
    reason: (reason ?? "").slice(0, 500) || null,
  });

  await notifyMany(
    [booking.customer_user_id],
    decision === "accept" ? "booking.tutor_accepted" : "booking.rejected",
    { code: booking.code, reason: reason ?? "" },
    { type: "booking", id: booking.id },
  );

  return { bookingId: booking.id, status: to };
}

/** Tutor moves a scheduled lesson through its own lifecycle. */
export async function progressBookingAsTutor(
  tutorId: string,
  idOrCode: string,
  to: "scheduled" | "in_progress" | "completed",
): Promise<TutorDecision> {
  const booking = await loadForTutor(tutorId, idOrCode);
  if (!canTransition(booking.status, to, "tutor")) {
    throw new BookingActionError("invalid_transition");
  }
  const tutor = await queryOne<{ user_id: string }>(`select user_id from tutors where id = $1`, [tutorId]);
  if (!tutor) throw new BookingActionError("not_found");

  await transitionBooking(store(), {
    bookingId: booking.id,
    to,
    actor: "tutor",
    actorUserId: tutor.user_id,
    reason: `tutor_marked_${to}`,
  });

  if (to === "completed") {
    await notifyMany([booking.customer_user_id], "booking.completed", { code: booking.code }, {
      type: "booking",
      id: booking.id,
    });
  }
  if (to === "scheduled") {
    await notifyMany([booking.customer_user_id], "booking.scheduled", { code: booking.code }, {
      type: "booking",
      id: booking.id,
    });
  }

  return { bookingId: booking.id, status: to };
}

/**
 * Meeting link for an online lesson. The tutor owns this field for their own
 * bookings; the value is validated through the provider abstraction, so a tutor
 * cannot store a non-meeting link that the UI would later render as a join
 * button.
 */
export async function setZoomLinkAsTutor(
  tutorId: string,
  idOrCode: string,
  url: string | null,
): Promise<void> {
  const booking = await loadForTutor(tutorId, idOrCode);
  if (url !== null && !videoProvider().validateLink(url)) {
    throw new BookingActionError("policy", "invalid_meeting_link");
  }
  await query(`update bookings set zoom_url = $2 where id = $1`, [booking.id, url]);
}

/** Only these statuses may still be cancelled by the customer (UI hint). */
export function cancellableByCustomer(status: BookingStatus): boolean {
  return canTransition(status, "cancelled", "customer");
}
