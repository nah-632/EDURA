/**
 * Booking reads for the customer and tutor dashboards (§7, §26).
 *
 * Every query is scoped by the signed-in user's id, so a booking id from the
 * URL can never fetch somebody else's lesson. Lists carry only the columns the
 * screens render - no internal notes, no admin fields, no storage paths.
 */
import { query, queryOne } from "@/lib/db";
import type { BookingStatus } from "@/lib/booking/state";
import type { PaymentStatus } from "@/lib/payments/service";

export interface BookingListItem {
  id: string;
  code: string;
  status: BookingStatus;
  scheduledDate: string;
  startTime: string;
  durationMinutes: number;
  method: string;
  price: string;
  currency: string;
  subjectName: string;
  lessonTypeName: string;
  stageName: string | null;
  tutorName: string | null;
  tutorSlug: string | null;
  studentName: string | null;
  areaName: string | null;
  paymentStatus: PaymentStatus | null;
  hasReview: boolean;
  createdAt: Date;
}

const LIST_COLUMNS = `
  b.id, b.code, b.status, b.scheduled_date::text as "scheduledDate",
  to_char(b.start_time, 'HH24:MI') as "startTime", b.duration_minutes as "durationMinutes",
  b.method::text as method, b.price, b.currency,
  coalesce(sj.name_ar, '') as "subjectName", coalesce(lt.name_ar, '') as "lessonTypeName",
  st.name_ar as "stageName",
  coalesce(tp.full_name, tp.full_name_ar) as "tutorName", t.slug as "tutorSlug",
  coalesce(cp.full_name, cp.full_name_ar) as "customerName",
  s.full_name as "studentName", ar.name_ar as "areaName",
  pay.status::text as "paymentStatus",
  (r.id is not null) as "hasReview",
  b.created_at as "createdAt"
`;

const LIST_JOINS = `
  left join tutors t on t.id = b.tutor_id
  left join users tu on tu.id = t.user_id
  left join user_profiles tp on tp.user_id = tu.id
  left join users cu on cu.id = b.customer_user_id
  left join user_profiles cp on cp.user_id = cu.id
  left join subjects sj on sj.id = b.subject_id
  left join lesson_types lt on lt.id = b.lesson_type_id
  left join educational_stages st on st.id = b.stage_id
  left join areas ar on ar.id = b.area_id
  left join students s on s.id = b.student_id
  left join reviews r on r.booking_id = b.id
  left join lateral (
    select status from payments where booking_id = b.id order by created_at desc limit 1
  ) pay on true
`;

/** Statuses whose lesson is still ahead of the customer. */
const UPCOMING = ["pending_payment", "payment_verification", "paid", "confirmed", "tutor_accepted", "scheduled", "in_progress"];

export async function listCustomerBookings(
  userId: string,
  scope: "upcoming" | "past" | "all" = "all",
): Promise<BookingListItem[]> {
  const filter =
    scope === "upcoming"
      ? `and b.status = any($2::booking_status[])`
      : scope === "past"
        ? `and not (b.status = any($2::booking_status[]))`
        : "";
  const params: unknown[] = [userId];
  if (scope !== "all") params.push(UPCOMING);
  return query<BookingListItem>(
    `select ${LIST_COLUMNS}
       from bookings b
       ${LIST_JOINS}
      where b.customer_user_id = $1 ${filter}
      order by b.scheduled_date desc, b.start_time desc`,
    params,
  );
}

export async function listTutorBookings(
  tutorId: string,
  scope: "requests" | "upcoming" | "past" | "all" = "all",
): Promise<BookingListItem[]> {
  const filter =
    scope === "requests"
      ? `and b.status = any(array['pending_payment','payment_verification']::booking_status[])`
      : scope === "upcoming"
        ? `and b.status = any(array['paid','confirmed','tutor_accepted','scheduled','in_progress']::booking_status[])`
        : scope === "past"
          ? `and b.status = any(array['completed','cancelled','rejected','refunded']::booking_status[])`
          : "";
  return query<BookingListItem>(
    `select ${LIST_COLUMNS}
       from bookings b
       ${LIST_JOINS}
      where b.tutor_id = $1 ${filter}
      order by b.scheduled_date desc, b.start_time desc`,
    [tutorId],
  );
}

export interface BookingDetail extends BookingListItem {
  customerUserId: string;
  customerName: string | null;
  customerNotes: string | null;
  addressNote: string | null;
  zoomUrl: string | null;
  pricePerHour: string;
  confirmedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
}

/** Customer view of one booking, by id or by its EDU-… code. */
export async function getCustomerBooking(userId: string, idOrCode: string): Promise<BookingDetail | null> {
  return queryOne<BookingDetail>(
    `select ${LIST_COLUMNS},
            b.customer_user_id as "customerUserId", cp.full_name as "customerName",
            b.customer_notes as "customerNotes", b.address_note as "addressNote",
            b.zoom_url as "zoomUrl", b.price_per_hour as "pricePerHour",
            b.confirmed_at as "confirmedAt", b.completed_at as "completedAt",
            b.cancelled_at as "cancelledAt", b.cancel_reason as "cancelReason"
       from bookings b
       ${LIST_JOINS}
       left join users cu on cu.id = b.customer_user_id
       left join user_profiles cp on cp.user_id = cu.id
      where b.customer_user_id = $1 and (b.id::text = $2 or b.code = $2)`,
    [userId, idOrCode],
  );
}

/** Tutor view of one booking (only bookings belonging to that tutor). */
export async function getTutorBooking(tutorId: string, idOrCode: string): Promise<BookingDetail | null> {
  return queryOne<BookingDetail>(
    `select ${LIST_COLUMNS},
            b.customer_user_id as "customerUserId", cp.full_name as "customerName",
            b.customer_notes as "customerNotes", b.address_note as "addressNote",
            b.zoom_url as "zoomUrl", b.price_per_hour as "pricePerHour",
            b.confirmed_at as "confirmedAt", b.completed_at as "completedAt",
            b.cancelled_at as "cancelledAt", b.cancel_reason as "cancelReason"
       from bookings b
       ${LIST_JOINS}
       left join users cu on cu.id = b.customer_user_id
       left join user_profiles cp on cp.user_id = cu.id
      where b.tutor_id = $1 and (b.id::text = $2 or b.code = $2)`,
    [tutorId, idOrCode],
  );
}

export interface CustomerCounts {
  active: number;
  leading: number;
  completed: number;
  cancelled: number;
  students: number;
  reviews: number;
}

export async function customerCounts(userId: string): Promise<CustomerCounts> {
  const row = await queryOne<{
    active: string;
    completed: string;
    cancelled: string;
    students: string;
    reviews: string;
  }>(
    `select
       count(*) filter (where status = any($2::booking_status[]))::text as active,
       count(*) filter (where status = 'completed')::text as completed,
       count(*) filter (where status in ('cancelled','rejected'))::text as cancelled,
       (select count(*) from students s where s.owner_user_id = $1 and s.deleted_at is null)::text as students,
       (select count(*) from reviews r where r.author_user_id = $1)::text as reviews
     from bookings where customer_user_id = $1`,
    [userId, UPCOMING],
  );
  return {
    active: Number(row?.active ?? 0),
    leading: 0,
    completed: Number(row?.completed ?? 0),
    cancelled: Number(row?.cancelled ?? 0),
    students: Number(row?.students ?? 0),
    reviews: Number(row?.reviews ?? 0),
  };
}

export interface TutorCounts {
  newRequests: number;
  upcoming: number;
  completed: number;
  cancelled: number;
  ratingAvg: string;
  ratingCount: number;
  grossValue: string;
}

export async function tutorCounts(tutorId: string): Promise<TutorCounts> {
  const row = await queryOne<{
    requests: string;
    upcoming: string;
    completed: string;
    cancelled: string;
    rating_avg: string;
    rating_count: number;
    gross: string;
  }>(
    `select
       count(*) filter (where status in ('pending_payment','payment_verification'))::text as requests,
       count(*) filter (where status in ('paid','confirmed','tutor_accepted','scheduled','in_progress'))::text as upcoming,
       count(*) filter (where status = 'completed')::text as completed,
       count(*) filter (where status in ('cancelled','rejected'))::text as cancelled,
       (select rating_avg from tutors where id = $1)::text as rating_avg,
       (select rating_count from tutors where id = $1) as rating_count,
       coalesce(sum(price) filter (where status = 'completed'), 0)::numeric(12,3)::text as gross
     from bookings where tutor_id = $1`,
    [tutorId],
  );
  return {
    newRequests: Number(row?.requests ?? 0),
    upcoming: Number(row?.upcoming ?? 0),
    completed: Number(row?.completed ?? 0),
    cancelled: Number(row?.cancelled ?? 0),
    ratingAvg: row?.rating_avg ?? "0.00",
    ratingCount: Number(row?.rating_count ?? 0),
    grossValue: row?.gross ?? "0.000",
  };
}
