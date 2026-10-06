/**
 * SQL adapter for the booking engine.
 *
 * This is the only place that knows how bookings are persisted. It surfaces the
 * database's exclusion-constraint violation (SQLSTATE 23P01) as SlotTakenError,
 * which the engine and the route turn into a 409 instead of a 500.
 */
import { DbError, PG, dbConfigured, query, withTransaction, type TxClient } from "@/lib/db";
import type {
  BookingRow,
  BookingStore,
  CreateBookingRequest,
  LessonTypeRow,
  StudentRow,
  TutorForBooking,
} from "./engine";
import { BookingError, SlotTakenError } from "./engine";
import type { AvailabilityWindow } from "./availability";
import type { BookingStatus } from "./state";
import type { TutorStatus } from "@/lib/tutor/status";

export class SqlBookingStore implements BookingStore {
  async getTutor(tutorId: string): Promise<TutorForBooking | null> {
    const rows = await query<{
      id: string;
      user_id: string;
      status: TutorStatus;
      price_per_hour: string;
      teaches_home: boolean;
      teaches_online: boolean;
      subscription_active: boolean;
      subject_ids: string[] | null;
      stage_ids: string[] | null;
    }>(
      `select t.id, t.user_id, t.status, t.price_per_hour, t.teaches_home, t.teaches_online,
              exists (
                select 1 from subscriptions s
                 where s.tutor_id = t.id and s.status = 'active'
                   and coalesce(s.grace_until, s.expires_at) > now()
              ) as subscription_active,
              (select array_agg(ts.subject_id) from tutor_subjects ts where ts.tutor_id = t.id) as subject_ids,
              (select array_agg(tg.stage_id) from tutor_stages tg where tg.tutor_id = t.id) as stage_ids
         from tutors t
        where (t.id::text = $1 or t.slug = $1) and t.deleted_at is null`,
      [tutorId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      pricePerHour: row.price_per_hour,
      teachesHome: row.teaches_home,
      teachesOnline: row.teaches_online,
      subscriptionActive: row.subscription_active,
      subjectIds: row.subject_ids ?? [],
      stageIds: row.stage_ids ?? [],
      subjectPriceOverride: null,
    };
  }

  async getStudent(studentId: string): Promise<StudentRow | null> {
    const rows = await query<{ id: string; owner_user_id: string; full_name: string; stage_id: string | null; is_minor: boolean }>(
      `select id, owner_user_id, full_name, stage_id, is_minor from students where id = $1 and deleted_at is null`,
      [studentId],
    );
    const row = rows[0];
    return row
      ? { id: row.id, ownerUserId: row.owner_user_id, fullName: row.full_name, stageId: row.stage_id, isMinor: row.is_minor }
      : null;
  }

  /**
   * Slice A+K: one row decides the guardian link (verified outranks pending).
   * The 0004 trigger enforces the same rule inside SQL for every INSERT.
   */
  async getGuardianVerification(studentId: string, guardianUserId: string): Promise<"verified" | "pending" | "none"> {
    const rows = await query<{ status: "verified" | "pending" }>(
      `select case bool_or(verification_status = 'verified')
                 when true then 'verified' else 'pending'
               end as status
         from guardian_links
        where student_id = $1 and guardian_user_id = $2
          and verification_status in ('pending', 'verified')`,
      [studentId, guardianUserId],
    );
    return rows[0]?.status ?? "none";
  }

  async getLessonType(lessonTypeId: string): Promise<LessonTypeRow | null> {
    const rows = await query<{ id: string; default_duration: number; price_multiplier: string; is_active: boolean }>(
      `select id, default_duration, price_multiplier, is_active
         from lesson_types where id::text = $1 or code = $1 limit 1`,
      [lessonTypeId],
    );
    const row = rows[0];
    return row
      ? {
          id: row.id,
          defaultDuration: row.default_duration,
          priceMultiplier: row.price_multiplier,
          isActive: row.is_active,
        }
      : null;
  }

  async getWindows(tutorId: string): Promise<AvailabilityWindow[]> {
    const rows = await query<{ weekday: number; start_time: string; end_time: string }>(
      `select weekday, start_time::text as start_time, end_time::text as end_time
         from tutor_availability where tutor_id = $1`,
      [tutorId],
    );
    return rows.map((r) => ({ weekday: r.weekday, startTime: r.start_time.slice(0, 5), endTime: r.end_time.slice(0, 5) }));
  }

  async getTimeOff(tutorId: string, fromDate: string, toDate: string) {
    const rows = await query<{ starts_at: Date; ends_at: Date }>(
      `select starts_at, ends_at from tutor_time_off
        where tutor_id = $1
          and ends_at >= ($2::date - interval '1 day')
          and starts_at <= ($3::date + interval '2 days')`,
      [tutorId, fromDate, toDate],
    );
    // Every other method here maps columns to the interface's camelCase shape;
    // this one returned the raw rows, so SqlBookingStore was not assignable to
    // BookingStore and nothing that took a BookingStore would accept it.
    return rows.map((r) => ({ startsAt: r.starts_at, endsAt: r.ends_at }));
  }

  async getBusy(tutorId: string, fromDate: string, toDate: string) {
    const rows = await query<{ starts_at: Date; ends_at: Date; status: BookingStatus }>(
      `select starts_at, ends_at, status from bookings
        where tutor_id = $1 and scheduled_date between $2::date and $3::date
          and status in ('pending_payment','payment_verification','paid','confirmed','tutor_accepted','scheduled','in_progress')`,
      [tutorId, fromDate, toDate],
    );
    // The column type is `timestamp` (wall clock); make it explicit so the
    // comparison against instants stays correct.
    return rows.map((r) => ({
      startsAt: new Date(`${(r.starts_at as unknown as string).replace(" ", "T")}+03:00`),
      endsAt: new Date(`${(r.ends_at as unknown as string).replace(" ", "T")}+03:00`),
      status: r.status,
    }));
  }

  async findByIdempotencyKey(key: string, customerUserId: string): Promise<BookingRow | null> {
    const rows = await query<{ id: string; code: string; status: BookingStatus; price: string }>(
      `select id, code, status, price from bookings
        where idempotency_key = $1 and customer_user_id = $2
        limit 1`,
      [key, customerUserId],
    );
    const row = rows[0];
    return row ? { id: row.id, code: row.code, status: row.status, price: row.price } : null;
  }

  /**
   * One transaction: allocate the code, insert the booking, insert the line
   * item. The exclusion constraint then decides any race for this slot.
   */
  async insertBooking(input: {
    code: string;
    request: CreateBookingRequest;
    price: string;
    pricePerHour: string;
    status: BookingStatus;
  }): Promise<BookingRow> {
    const { request } = input;
    try {
      return await withTransaction(async (tx: TxClient) => {
        // Serialise on the tutor row as well: the advisory lock makes the
        // "is it free" read and the insert atomic for this tutor, so callers
        // get a deterministic answer instead of a race.
        await tx.query("select pg_advisory_xact_lock(hashtext($1))", [request.tutorId]);
        const rows = await tx.query<{ id: string; code: string; status: BookingStatus; price: string }>(
          `insert into bookings (
             code, tutor_id, student_id, customer_user_id, subject_id, stage_id, lesson_type_id,
             method, scheduled_date, start_time, duration_minutes, area_id, address_note,
             customer_notes, price_per_hour, price, status, idempotency_key
           ) values (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9::date, $10::time, $11, $12, $13,
             $14, $15::numeric, $16::numeric, $17, $18
           )
           returning id, code, status, price`,
          [
            input.code,
            request.tutorId,
            request.studentId,
            request.customerUserId,
            request.subjectId,
            request.stageId,
            request.lessonTypeId,
            request.method,
            request.date,
            request.time,
            request.durationMinutes,
            request.areaId ?? null,
            request.addressNote ?? null,
            request.customerNotes ?? null,
            input.pricePerHour,
            input.price,
            input.status,
            request.idempotencyKey ?? null,
          ],
        );
        const booking = rows[0]!;
        await tx.query(
          `insert into booking_items (booking_id, kind, quantity, unit_price, amount)
           values ($1, 'lesson', 1, $2::numeric, $2::numeric)`,
          [booking.id, input.price],
        );
        return booking;
      });
    } catch (err) {
      if (err instanceof DbError && err.code === PG.EXCLUSION_VIOLATION) {
        throw new SlotTakenError();
      }
      // Slice A+K: the 0004 trigger refused a booking for a minor without a
      // verified guardian link — surface the same stable code the engine uses.
      if (err instanceof DbError && err.code === PG.GUARDIAN_REQUIRED) {
        throw new BookingError("guardian_required");
      }
      throw err;
    }
  }

  async getBooking(bookingId: string) {
    const rows = await query<{ id: string; status: BookingStatus; tutor_id: string }>(
      `select id, status, tutor_id from bookings where id = $1`,
      [bookingId],
    );
    const row = rows[0];
    return row ? { id: row.id, status: row.status, tutorId: row.tutor_id } : null;
  }

  async updateStatus(bookingId: string, to: BookingStatus, actorUserId: string | null, reason: string | null) {
    await withTransaction(async (tx) => {
      const before = await tx.one<{ status: BookingStatus }>(
        "select status from bookings where id = $1 for update",
        [bookingId],
      );
      await tx.query(
        `update bookings
            set status = $2,
                cancelled_at = case when $2 in ('cancelled','rejected') then now() else cancelled_at end,
                cancelled_by = case when $2 in ('cancelled','rejected') then $3 else cancelled_by end,
                cancel_reason = case when $2 in ('cancelled','rejected') then $4 else cancel_reason end,
                confirmed_at = case when $2 = 'confirmed' then now() else confirmed_at end,
                completed_at = case when $2 = 'completed' then now() else completed_at end
          where id = $1`,
        [bookingId, to, actorUserId, reason],
      );
      await tx.query(
        `insert into audit_logs (actor_user_id, action, entity, entity_id, reason, before, after)
         values ($1, 'booking.status_change', 'bookings', $2, $3, $4, $5)`,
        [actorUserId, bookingId, reason, JSON.stringify({ status: before?.status }), JSON.stringify({ status: to })],
      );
    });
  }

  async createPaymentForBooking(bookingId: string, amount: string, code: string) {
    await query(
      `insert into payments (reference_code, subject_type, booking_id, amount, method, status)
       values ($1, 'booking', $2, $3::numeric, 'benefitpay', 'pending')`,
      [`PAY-${code}`, bookingId, amount],
    );
  }

  async notify(userId: string, type: string, params: Record<string, unknown>, entityId?: string) {
    await query(
      `insert into notifications (user_id, type, params, channel, entity_type, entity_id)
       values ($1, $2, $3, 'in_app', 'booking', $4)`,
      [userId, type, JSON.stringify(params), entityId ?? null],
    );
  }
}

/** Allocate the booking code from the database sequence (atomic). */
export async function nextBookingCode(day: string): Promise<string> {
  const rows = await query<{ code: string }>("select next_booking_code($1::date) as code", [day]);
  return rows[0]!.code;
}

export function bookingStoreAvailable(): boolean {
  return dbConfigured();
}
