/**
 * Admin console reads (§15, §16).
 *
 * Every function returns `{ dbReady, data }`. `dbReady: false` means the
 * database is not reachable or not configured - the console then shows a
 * configuration notice, NOT zeros dressed up as analytics. That distinction
 * matters: "0 bookings" and "we cannot read bookings" are different facts, and
 * an admin making a decision deserves to know which one they are looking at
 * (§16: never fabricate analytics).
 *
 * Reads select only the columns each screen renders, and never a storage path
 * or a secret.
 */
import type { BookingStatus } from "@/lib/booking/state";
import { dbConfigured, query, queryOne } from "@/lib/db";
import type { PaymentStatus } from "@/lib/payments/service";
import type { ReviewStatus } from "@/lib/reviews/rules";
import type { Permission } from "@/lib/security/rbac";
import { ROLE_PERMISSIONS, type RoleCode } from "@/lib/security/rbac";
import type { SubscriptionStatus } from "@/lib/subscriptions/rules";
import type { TutorStatus } from "@/lib/tutor/status";

/**
 * Column types for the console's rows.
 *
 * Status columns are typed with the SAME union the domain and the database enum
 * use, never `string`. That is what lets a screen hand a row's status straight
 * to a state-machine function (`allowedTransitions(booking.status, "admin")`)
 * without a cast — and it is the rule `npm run check:row-types` enforces, added
 * after a production build failed on exactly that mismatch.
 */

export interface AdminData<T> {
  dbReady: boolean;
  data: T;
}

async function safe<T>(fallback: T, run: () => Promise<T>): Promise<AdminData<T>> {
  if (!dbConfigured()) return { dbReady: false, data: fallback };
  try {
    return { dbReady: true, data: await run() };
  } catch (err) {
    console.error("[admin/queries]", err instanceof Error ? err.message : "unknown");
    return { dbReady: false, data: fallback };
  }
}

// ---------------------------------------------------------------------------
// Overview (§16)
// ---------------------------------------------------------------------------
export interface Overview {
  tutors: {
    total: number;
    pending: number;
    underReview: number;
    approved: number;
    rejected: number;
    suspended: number;
    expiredSubscription: number;
    listed: number;
  };
  users: { total: number; students: number; tutors: number; admins: number; suspended: number };
  bookings: { total: number; byStatus: Record<string, number>; upcoming: number; completed: number };
  payments: { pending: number; submitted: number; verified: number; refunded: number };
  revenue: { subscription: string; booking: string; thisMonth: string; currency: "BHD" };
  chart: { day: string; bookings: number }[];
  recentBookings: RecentBooking[];
  recentAudit: AuditRow[];
  actionsNeeded: { pendingTutors: number; pendingPayments: number; reportedReviews: number; unverifiedDocuments: number };
}

export interface RecentBooking {
  id: string;
  code: string;
  status: BookingStatus;
  scheduledDate: string;
  startTime: string;
  price: string;
  tutorName: string | null;
  customerName: string | null;
  createdAt: Date;
}

export interface AuditRow {
  id: string;
  actorLabel: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: Date;
}

const EMPTY_OVERVIEW: Overview = {
  tutors: { total: 0, pending: 0, underReview: 0, approved: 0, rejected: 0, suspended: 0, expiredSubscription: 0, listed: 0 },
  users: { total: 0, students: 0, tutors: 0, admins: 0, suspended: 0 },
  bookings: { total: 0, byStatus: {}, upcoming: 0, completed: 0 },
  payments: { pending: 0, submitted: 0, verified: 0, refunded: 0 },
  revenue: { subscription: "0.000", booking: "0.000", thisMonth: "0.000", currency: "BHD" },
  chart: [],
  recentBookings: [],
  recentAudit: [],
  actionsNeeded: { pendingTutors: 0, pendingPayments: 0, reportedReviews: 0, unverifiedDocuments: 0 },
};

export function getOverview(): Promise<AdminData<Overview>> {
  return safe(EMPTY_OVERVIEW, async () => {
    const [tutorCounts, userCounts, bookingCounts, paymentCounts, revenue, chart, recentBookings, recentAudit, actions] =
      await Promise.all([
        queryOne<{
          total: string;
          pending: string;
          under_review: string;
          approved: string;
          rejected: string;
          suspended: string;
          expired_subscription: string;
        }>(
          `select count(*)::text as total,
                  count(*) filter (where status = 'pending')::text as pending,
                  count(*) filter (where status = 'under_review')::text as under_review,
                  count(*) filter (where status = 'approved')::text as approved,
                  count(*) filter (where status = 'rejected')::text as rejected,
                  count(*) filter (where status = 'suspended')::text as suspended,
                  count(*) filter (where status = 'expired_subscription')::text as expired_subscription
             from tutors where deleted_at is null`,
        ),
        queryOne<{ total: string; students: string; tutors: string; admins: string; suspended: string }>(
          `select count(*)::text as total,
                  count(*) filter (where primary_role in ('student','parent'))::text as students,
                  count(*) filter (where primary_role = 'tutor')::text as tutors,
                  count(*) filter (where primary_role = 'admin')::text as admins,
                  count(*) filter (where status <> 'active')::text as suspended
             from users where deleted_at is null`,
        ),
        query<{ status: string; count: string }>(
          `select status::text as status, count(*)::text as count from bookings group by status`,
        ),
        queryOne<{ pending: string; submitted: string; verified: string; refunded: string }>(
          `select count(*) filter (where status = 'pending')::text as pending,
                  count(*) filter (where status = 'submitted')::text as submitted,
                  count(*) filter (where status = 'verified')::text as verified,
                  count(*) filter (where status = 'refunded')::text as refunded
             from payments`,
        ),
        queryOne<{ subscription: string; booking: string; this_month: string }>(
          `select
             coalesce((select sum(amount) from payments
                        where subject_type = 'subscription' and status = 'verified'), 0)::numeric(12,3)::text as subscription,
             coalesce((select sum(amount) from payments
                        where subject_type = 'booking' and status = 'verified'), 0)::numeric(12,3)::text as booking,
             coalesce((select sum(amount) from payments
                        where status = 'verified'
                          and verified_at >= date_trunc('month', now() at time zone 'Asia/Bahrain')), 0)::numeric(12,3)::text as this_month`,
        ),
        query<{ day: string; count: string }>(
          `select to_char(date_trunc('day', created_at at time zone 'Asia/Bahrain'), 'YYYY-MM-DD') as day,
                  count(*)::text as count
             from bookings
            where created_at >= now() - interval '14 days'
            group by 1 order by 1`,
        ),
        listRecentBookings(5),
        listAudit(6),
        queryOne<{ pending_tutors: string; pending_payments: string; reported_reviews: string; documents: string }>(
          `select
             (select count(*) from tutors where status in ('pending','under_review') and deleted_at is null)::text as pending_tutors,
             (select count(*) from payments where status in ('pending','submitted'))::text as pending_payments,
             (select count(*) from reviews where status = 'reported')::text as reported_reviews,
             (select count(*) from tutor_documents where status = 'uploaded')::text as documents`,
        ),
      ]);

    const byStatus: Record<string, number> = {};
    for (const row of bookingCounts) byStatus[row.status] = Number(row.count);
    const total = Object.values(byStatus).reduce((acc, value) => acc + value, 0);
    const reservationStatuses = ["paid", "confirmed", "tutor_accepted", "scheduled", "in_progress"];
    // "Listed" is the count the public search view actually exposes, so an
    // admin can see at a glance whether approved profiles are reachable.
    const listed = await queryOne<{ count: string }>(`select count(*)::text as count from public_tutors`);

    return {
      tutors: {
        total: Number(tutorCounts?.total ?? 0),
        pending: Number(tutorCounts?.pending ?? 0),
        underReview: Number(tutorCounts?.under_review ?? 0),
        approved: Number(tutorCounts?.approved ?? 0),
        rejected: Number(tutorCounts?.rejected ?? 0),
        suspended: Number(tutorCounts?.suspended ?? 0),
        expiredSubscription: Number(tutorCounts?.expired_subscription ?? 0),
        listed: Number(listed?.count ?? 0),
      },
      users: {
        total: Number(userCounts?.total ?? 0),
        students: Number(userCounts?.students ?? 0),
        tutors: Number(userCounts?.tutors ?? 0),
        admins: Number(userCounts?.admins ?? 0),
        suspended: Number(userCounts?.suspended ?? 0),
      },
      bookings: {
        total,
        byStatus,
        upcoming: reservationStatuses.reduce((acc, status) => acc + (byStatus[status] ?? 0), 0),
        completed: byStatus.completed ?? 0,
      },
      payments: {
        pending: Number(paymentCounts?.pending ?? 0),
        submitted: Number(paymentCounts?.submitted ?? 0),
        verified: Number(paymentCounts?.verified ?? 0),
        refunded: Number(paymentCounts?.refunded ?? 0),
      },
      revenue: {
        subscription: revenue?.subscription ?? "0.000",
        booking: revenue?.booking ?? "0.000",
        thisMonth: revenue?.this_month ?? "0.000",
        currency: "BHD",
      },
      chart: chart.map((row) => ({ day: row.day, bookings: Number(row.count) })),
      recentBookings,
      recentAudit,
      actionsNeeded: {
        pendingTutors: Number(actions?.pending_tutors ?? 0),
        pendingPayments: Number(actions?.pending_payments ?? 0),
        reportedReviews: Number(actions?.reported_reviews ?? 0),
        unverifiedDocuments: Number(actions?.documents ?? 0),
      },
    };
  });
}

export function listRecentBookings(limit = 8): Promise<RecentBooking[]> {
  return query<RecentBooking>(
    `select b.id, b.code, b.status::text as status, b.scheduled_date::text as "scheduledDate",
            to_char(b.start_time, 'HH24:MI') as "startTime", b.price,
            coalesce(tp.full_name, tp.full_name_ar) as "tutorName",
            coalesce(cp.full_name, cp.full_name_ar) as "customerName",
            b.created_at as "createdAt"
       from bookings b
       left join tutors t on t.id = b.tutor_id
       left join users tu on tu.id = t.user_id
       left join user_profiles tp on tp.user_id = tu.id
       left join users cu on cu.id = b.customer_user_id
       left join user_profiles cp on cp.user_id = cu.id
      order by b.created_at desc
      limit $1`,
    [Math.min(Math.max(limit, 1), 50)],
  );
}

export function listAudit(limit = 50, filter: { action?: string; entity?: string } = {}): Promise<AuditRow[]> {
  const conditions = ["1 = 1"];
  const params: unknown[] = [];
  if (filter.action) {
    params.push(`%${filter.action}%`);
    conditions.push(`action like $${params.length}`);
  }
  if (filter.entity) {
    params.push(filter.entity);
    conditions.push(`entity = $${params.length}`);
  }
  params.push(Math.min(Math.max(limit, 1), 200));
  return query<AuditRow>(
    `select id::text as id, actor_label as "actorLabel", action, entity, entity_id as "entityId",
            reason, before, after, ip, created_at as "createdAt"
       from audit_logs
      where ${conditions.join(" and ")}
      order by created_at desc, id desc
      limit $${params.length}`,
    params,
  );
}

// ---------------------------------------------------------------------------
// Tutors
// ---------------------------------------------------------------------------
export interface TutorAdminRow {
  id: string;
  slug: string | null;
  status: TutorStatus;
  fullName: string | null;
  email: string;
  phone: string;
  city: string | null;
  pricePerHour: string;
  teachesHome: boolean;
  teachesOnline: boolean;
  yearsExperience: number;
  submittedAt: Date | null;
  approvedAt: Date | null;
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionExpiresAt: Date | null;
  documentCount: number;
  ratingAvg: string;
  ratingCount: number;
}

export function listTutorsAdmin(filter: { status?: string; search?: string; limit?: number; offset?: number } = {}) {
  return safe<TutorAdminRow[]>([], async () => {
    const conditions = ["t.deleted_at is null"];
    const params: unknown[] = [];
    if (filter.status && filter.status !== "all") {
      params.push(filter.status);
      conditions.push(`t.status = $${params.length}::tutor_status`);
    }
    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      const idx = params.length;
      conditions.push(
        `(lower(coalesce(p.full_name, '')) like $${idx} or lower(coalesce(p.full_name_ar, '')) like $${idx}
          or lower(u.email) like $${idx} or lower(u.phone) like $${idx})`,
      );
    }
    params.push(Math.min(Math.max(filter.limit ?? 50, 1), 200));
    const limitIdx = params.length;
    params.push(Math.max(filter.offset ?? 0, 0));
    const offsetIdx = params.length;

    return query<TutorAdminRow>(
      `select t.id, t.slug, t.status::text as status,
              coalesce(p.full_name_ar, p.full_name) as "fullName",
              u.email, u.phone,
              a.name_ar as "city",
              t.price_per_hour as "pricePerHour", t.teaches_home as "teachesHome",
              t.teaches_online as "teachesOnline", t.years_experience as "yearsExperience",
              t.submitted_at as "submittedAt", t.approved_at as "approvedAt",
              s.status::text as "subscriptionStatus", s.expires_at as "subscriptionExpiresAt",
              (select count(*)::int from tutor_documents d where d.tutor_id = t.id) as "documentCount",
              t.rating_avg::text as "ratingAvg", t.rating_count as "ratingCount"
         from tutors t
         join users u on u.id = t.user_id
         left join user_profiles p on p.user_id = u.id
         left join areas a on a.id = t.area_id
         left join lateral (
           select status, expires_at, grace_until from subscriptions
            where tutor_id = t.id order by created_at desc limit 1
         ) s on true
        where ${conditions.join(" and ")}
        order by t.created_at desc
        limit $${limitIdx} offset $${offsetIdx}`,
      params,
    );
  });
}

export interface TutorAdminDetail {
  tutor: TutorAdminRow & {
    headlineAr: string | null;
    headlineEn: string | null;
    bioAr: string | null;
    bioEn: string | null;
    qualification: string | null;
    university: string | null;
    major: string | null;
    graduationYear: number | null;
    gender: string | null;
    languages: string[];
    adminNotes: string | null;
    rejectionReason: string | null;
    reviewedAt: Date | null;
    userId: string;
    accountStatus: UserStatus;
  };
  subjects: { id: string; name: string }[];
  stages: { id: string; name: string }[];
  areas: { id: string; name: string }[];
  availability: { weekday: number; startTime: string; endTime: string; method: string | null }[];
  timeOff: { id: string; startsAt: Date; endsAt: Date; reason: string | null }[];
  lessons: { upcoming: number; completed: number; cancelled: number };
}

export function getTutorAdmin(id: string): Promise<AdminData<TutorAdminDetail | null>> {
  return safe<TutorAdminDetail | null>(null, async () => {
    const tutor = await queryOne<TutorAdminDetail["tutor"]>(
      `select t.id, t.slug, t.status::text as status,
              coalesce(p.full_name_ar, p.full_name) as "fullName",
              u.email, u.phone, u.id as "userId", u.status::text as "accountStatus",
              a.name_ar as "city",
              t.price_per_hour as "pricePerHour", t.teaches_home as "teachesHome",
              t.teaches_online as "teachesOnline", t.years_experience as "yearsExperience",
              t.submitted_at as "submittedAt", t.approved_at as "approvedAt",
              t.headline_ar as "headlineAr", t.headline_en as "headlineEn",
              t.bio_ar as "bioAr", t.bio_en as "bioEn",
              t.qualification, t.university, t.major, t.graduation_year as "graduationYear",
              t.gender, t.languages, t.admin_notes as "adminNotes",
              t.rejection_reason as "rejectionReason", t.reviewed_at as "reviewedAt",
              s.status::text as "subscriptionStatus", s.expires_at as "subscriptionExpiresAt",
              (select count(*)::int from tutor_documents d where d.tutor_id = t.id) as "documentCount",
              t.rating_avg::text as "ratingAvg", t.rating_count as "ratingCount"
         from tutors t
         join users u on u.id = t.user_id
         left join user_profiles p on p.user_id = u.id
         left join areas a on a.id = t.area_id
         left join lateral (
           select status, expires_at from subscriptions where tutor_id = t.id order by created_at desc limit 1
         ) s on true
        where t.id = $1 and t.deleted_at is null`,
      [id],
    );
    if (!tutor) return null;

    const [subjects, stages, areas, availability, timeOff, lessonCounts] = await Promise.all([
      query<{ id: string; name: string }>(
        `select s.id, s.name_ar as name from tutor_subjects ts join subjects s on s.id = ts.subject_id where ts.tutor_id = $1 order by s.sort_order`,
        [id],
      ),
      query<{ id: string; name: string }>(
        `select s.id, s.name_ar as name from tutor_stages tg join educational_stages s on s.id = tg.stage_id where tg.tutor_id = $1 order by s.sort_order`,
        [id],
      ),
      query<{ id: string; name: string }>(
        `select a.id, a.name_ar as name from tutor_areas ta join areas a on a.id = ta.area_id where ta.tutor_id = $1 order by a.sort_order`,
        [id],
      ),
      query<{ weekday: number; startTime: string; endTime: string; method: string | null }>(
        `select weekday, to_char(start_time, 'HH24:MI') as "startTime",
                to_char(end_time, 'HH24:MI') as "endTime", method::text as method
           from tutor_availability where tutor_id = $1 order by weekday, start_time`,
        [id],
      ),
      query<{ id: string; startsAt: Date; endsAt: Date; reason: string | null }>(
        `select id, starts_at as "startsAt", ends_at as "endsAt", reason
           from tutor_time_off where tutor_id = $1 and ends_at >= now() order by starts_at`,
        [id],
      ),
      queryOne<{ upcoming: string; completed: string; cancelled: string }>(
        `select
           count(*) filter (where status in ('paid','confirmed','tutor_accepted','scheduled','in_progress'))::text as upcoming,
           count(*) filter (where status = 'completed')::text as completed,
           count(*) filter (where status in ('cancelled','rejected'))::text as cancelled
         from bookings where tutor_id = $1`,
        [id],
      ),
    ]);

    return {
      tutor,
      subjects,
      stages,
      areas,
      availability,
      timeOff,
      lessons: {
        upcoming: Number(lessonCounts?.upcoming ?? 0),
        completed: Number(lessonCounts?.completed ?? 0),
        cancelled: Number(lessonCounts?.cancelled ?? 0),
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
/** Mirrors the `user_status` and `user_role_kind` database enums. */
export type UserStatus = "active" | "restricted" | "suspended" | "deleted";
export type UserRoleKind = "student" | "parent" | "tutor" | "admin";

export interface UserAdminRow {
  id: string;
  fullName: string | null;
  email: string;
  phone: string;
  primaryRole: UserRoleKind;
  status: UserStatus;
  locale: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  bookingCount: number;
  studentCount: number;
  isTutor: boolean;
}

export function listUsersAdmin(filter: { role?: string; status?: string; search?: string; limit?: number } = {}) {
  return safe<UserAdminRow[]>([], async () => {
    const conditions = ["u.deleted_at is null"];
    const params: unknown[] = [];
    if (filter.role && filter.role !== "all") {
      params.push(filter.role);
      conditions.push(`u.primary_role = $${params.length}::user_role_kind`);
    }
    if (filter.status && filter.status !== "all") {
      params.push(filter.status);
      conditions.push(`u.status = $${params.length}::user_status`);
    }
    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      const idx = params.length;
      conditions.push(
        `(lower(u.email) like $${idx} or lower(u.phone) like $${idx} or lower(coalesce(p.full_name,'')) like $${idx})`,
      );
    }
    params.push(Math.min(Math.max(filter.limit ?? 60, 1), 200));
    return query<UserAdminRow>(
      `select u.id, coalesce(p.full_name_ar, p.full_name) as "fullName", u.email, u.phone,
              u.primary_role::text as "primaryRole", u.status::text as "status", u.locale,
              u.created_at as "createdAt", u.last_login_at as "lastLoginAt",
              (select count(*)::int from bookings b where b.customer_user_id = u.id) as "bookingCount",
              (select count(*)::int from students s where s.owner_user_id = u.id and s.deleted_at is null) as "studentCount",
              exists (select 1 from tutors t where t.user_id = u.id and t.deleted_at is null) as "isTutor"
         from users u
         left join user_profiles p on p.user_id = u.id
        where ${conditions.join(" and ")}
        order by u.created_at desc
        limit $${params.length}`,
      params,
    );
  });
}

export interface UserAdminDetail {
  user: UserAdminRow & { locale: string; mfaEnabled: boolean; failedLogins: number; lockedUntil: Date | null };
  roles: string[];
  students: { id: string; fullName: string; grade: string | null; isMinor: boolean }[];
  bookings: RecentBooking[];
  tutorId: string | null;
}

export function getUserAdmin(id: string): Promise<AdminData<UserAdminDetail | null>> {
  return safe<UserAdminDetail | null>(null, async () => {
    const user = await queryOne<UserAdminDetail["user"]>(
      `select u.id, coalesce(p.full_name_ar, p.full_name) as "fullName", u.email, u.phone,
              u.primary_role::text as "primaryRole", u.status::text as "status", u.locale,
              u.created_at as "createdAt", u.last_login_at as "lastLoginAt",
              u.mfa_enabled as "mfaEnabled", u.failed_logins as "failedLogins",
              u.locked_until as "lockedUntil",
              (select count(*)::int from bookings b where b.customer_user_id = u.id) as "bookingCount",
              (select count(*)::int from students s where s.owner_user_id = u.id and s.deleted_at is null) as "studentCount",
              exists (select 1 from tutors t where t.user_id = u.id and t.deleted_at is null) as "isTutor"
         from users u
         left join user_profiles p on p.user_id = u.id
        where u.id = $1 and u.deleted_at is null`,
      [id],
    );
    if (!user) return null;

    const [roles, students, bookings, tutor] = await Promise.all([
      query<{ code: string }>(
        `select r.code from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = $1 order by r.code`,
        [id],
      ),
      query<{ id: string; fullName: string; grade: string | null; isMinor: boolean }>(
        `select id, full_name as "fullName", grade, is_minor as "isMinor"
           from students where owner_user_id = $1 and deleted_at is null order by created_at`,
        [id],
      ),
      query<RecentBooking>(
        `select b.id, b.code, b.status::text as status, b.scheduled_date::text as "scheduledDate",
                to_char(b.start_time, 'HH24:MI') as "startTime", b.price,
                coalesce(tp.full_name, tp.full_name_ar) as "tutorName",
                null::text as "customerName", b.created_at as "createdAt"
           from bookings b
           left join tutors t on t.id = b.tutor_id
           left join users tu on tu.id = t.user_id
           left join user_profiles tp on tp.user_id = tu.id
          where b.customer_user_id = $1
          order by b.created_at desc limit 20`,
        [id],
      ),
      queryOne<{ id: string }>(`select id from tutors where user_id = $1 and deleted_at is null`, [id]),
    ]);

    return {
      user,
      roles: roles.map((r) => r.code),
      students,
      bookings,
      tutorId: tutor?.id ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------
export interface BookingAdminRow {
  id: string;
  code: string;
  status: BookingStatus;
  scheduledDate: string;
  startTime: string;
  durationMinutes: number;
  method: string;
  price: string;
  currency: string;
  tutorId: string;
  tutorName: string | null;
  customerUserId: string;
  customerName: string | null;
  subjectName: string | null;
  lessonTypeName: string | null;
  paymentStatus: PaymentStatus | null;
  createdAt: Date;
}

export function listBookingsAdmin(
  filter: { status?: string; search?: string; from?: string; to?: string; sort?: string; limit?: number; offset?: number } = {},
) {
  return safe<BookingAdminRow[]>([], async () => {
    const conditions = ["1 = 1"];
    const params: unknown[] = [];
    if (filter.status && filter.status !== "all") {
      params.push(filter.status);
      conditions.push(`b.status = $${params.length}::booking_status`);
    }
    if (filter.search) {
      params.push(`%${filter.search.toLowerCase()}%`);
      const idx = params.length;
      conditions.push(
        `(lower(b.code) like $${idx} or lower(coalesce(cp.full_name,'')) like $${idx} or lower(coalesce(tp.full_name,'')) like $${idx})`,
      );
    }
    if (filter.from) {
      params.push(filter.from);
      conditions.push(`b.scheduled_date >= $${params.length}::date`);
    }
    if (filter.to) {
      params.push(filter.to);
      conditions.push(`b.scheduled_date <= $${params.length}::date`);
    }
    const order = filter.sort === "lessonDate" ? "b.scheduled_date desc, b.start_time desc" : "b.created_at desc";
    params.push(Math.min(Math.max(filter.limit ?? 60, 1), 200));
    const limitIdx = params.length;
    params.push(Math.max(filter.offset ?? 0, 0));
    const offsetIdx = params.length;

    return query<BookingAdminRow>(
      `select b.id, b.code, b.status::text as status, b.scheduled_date::text as "scheduledDate",
              to_char(b.start_time, 'HH24:MI') as "startTime", b.duration_minutes as "durationMinutes",
              b.method::text as method, b.price, b.currency,
              b.tutor_id as "tutorId", coalesce(tp.full_name, tp.full_name_ar) as "tutorName",
              b.customer_user_id as "customerUserId", coalesce(cp.full_name, cp.full_name_ar) as "customerName",
              coalesce(sj.name_ar, '') as "subjectName", coalesce(lt.name_ar, '') as "lessonTypeName",
              pay.status::text as "paymentStatus", b.created_at as "createdAt"
         from bookings b
         left join tutors t on t.id = b.tutor_id
         left join users tu on tu.id = t.user_id
         left join user_profiles tp on tp.user_id = tu.id
         left join users cu on cu.id = b.customer_user_id
         left join user_profiles cp on cp.user_id = cu.id
         left join subjects sj on sj.id = b.subject_id
         left join lesson_types lt on lt.id = b.lesson_type_id
         left join lateral (
           select status from payments where booking_id = b.id order by created_at desc limit 1
         ) pay on true
        where ${conditions.join(" and ")}
        order by ${order}
        limit $${limitIdx} offset $${offsetIdx}`,
      params,
    );
  });
}

export interface BookingAdminDetail {
  booking: BookingAdminRow & {
    addressNote: string | null;
    zoomUrl: string | null;
    customerNotes: string | null;
    adminNotes: string | null;
    areaName: string | null;
    studentName: string | null;
    stageName: string | null;
    tutorUserId: string;
    customerEmail: string;
    customerPhone: string;
    createdAt: Date;
    confirmedAt: Date | null;
    completedAt: Date | null;
    cancelledAt: Date | null;
    cancelReason: string | null;
  };
  payment: {
    id: string;
    referenceCode: string;
    amount: string;
    status: PaymentStatus;
    customerReference: string | null;
    verifiedAt: Date | null;
    rejectionReason: string | null;
    proofs: { id: string; source: string; createdAt: Date; receivedNote: string | null }[];
  } | null;
  timeline: AuditRow[];
  review: { id: string; rating: number; status: ReviewStatus; comment: string | null } | null;
}

export function getBookingAdmin(id: string): Promise<AdminData<BookingAdminDetail | null>> {
  return safe<BookingAdminDetail | null>(null, async () => {
    const booking = await queryOne<BookingAdminDetail["booking"]>(
      `select b.id, b.code, b.status::text as status, b.scheduled_date::text as "scheduledDate",
              to_char(b.start_time, 'HH24:MI') as "startTime", b.duration_minutes as "durationMinutes",
              b.method::text as method, b.price, b.currency,
              b.tutor_id as "tutorId", coalesce(tp.full_name, tp.full_name_ar) as "tutorName",
              b.customer_user_id as "customerUserId", coalesce(cp.full_name, cp.full_name_ar) as "customerName",
              sj.name_ar as "subjectName", lt.name_ar as "lessonTypeName",
              st.name_ar as "stageName", ar.name_ar as "areaName", s.full_name as "studentName",
              b.address_note as "addressNote", b.zoom_url as "zoomUrl",
              b.customer_notes as "customerNotes", b.admin_notes as "adminNotes",
              tu.id as "tutorUserId", cu.email as "customerEmail", cu.phone as "customerPhone",
              b.created_at as "createdAt", b.confirmed_at as "confirmedAt", b.completed_at as "completedAt",
              b.cancelled_at as "cancelledAt", b.cancel_reason as "cancelReason",
              null::text as "paymentStatus"
         from bookings b
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
        where b.id = $1`,
      [id],
    );
    if (!booking) return null;

    const [payment, proofs, timeline, review] = await Promise.all([
      queryOne<{
        id: string;
        referenceCode: string;
        amount: string;
        status: PaymentStatus;
        customerReference: string | null;
        verifiedAt: Date | null;
        rejectionReason: string | null;
      }>(
        `select id, reference_code as "referenceCode", amount, status, customer_reference as "customerReference",
                verified_at as "verifiedAt", rejection_reason as "rejectionReason"
           from payments where booking_id = $1 order by created_at desc limit 1`,
        [id],
      ),
      query<{ id: string; source: string; createdAt: Date; receivedNote: string | null }>(
        `select pp.id, pp.source::text as source, pp.created_at as "createdAt", pp.received_note as "receivedNote"
           from payment_proofs pp join payments p on p.id = pp.payment_id
          where p.booking_id = $1 order by pp.created_at desc`,
        [id],
      ),
      query<AuditRow>(
        `select id::text as id, actor_label as "actorLabel", action, entity, entity_id as "entityId",
                reason, before, after, ip, created_at as "createdAt"
           from audit_logs
          where (entity = 'bookings' and entity_id = $1)
          order by created_at desc, id desc
          limit 40`,
        [id],
      ),
      queryOne<{ id: string; rating: number; status: ReviewStatus; comment: string | null }>( // reviews.status is the review_status enum cast to text, so ReviewStatus is exact
        `select id, rating, status::text as status, comment from reviews where booking_id = $1`,
        [id],
      ),
    ]);

    return {
      booking: { ...booking, paymentStatus: payment?.status ?? null },
      payment: payment ? { ...payment, proofs } : null,
      timeline,
      review,
    };
  });
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------
export interface ReviewAdminRow {
  id: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  tutorId: string;
  tutorName: string | null;
  bookingCode: string | null;
  authorName: string | null;
  moderationNote: string | null;
  createdAt: Date;
}

export function listReviewsAdmin(filter: { status?: string; limit?: number } = {}) {
  return safe<ReviewAdminRow[]>([], async () => {
    const conditions = ["1 = 1"];
    const params: unknown[] = [];
    if (filter.status && filter.status !== "all") {
      params.push(filter.status);
      conditions.push(`r.status = $${params.length}::review_status`);
    }
    params.push(Math.min(Math.max(filter.limit ?? 60, 1), 200));
    return query<ReviewAdminRow>(
      `select r.id, r.rating, r.comment, r.status::text as status, r.tutor_id as "tutorId",
              coalesce(tp.full_name, tp.full_name_ar) as "tutorName",
              b.code as "bookingCode",
              coalesce(ap.full_name, ap.full_name_ar) as "authorName",
              r.moderation_note as "moderationNote", r.created_at as "createdAt"
         from reviews r
         join tutors t on t.id = r.tutor_id
         left join users tu on tu.id = t.user_id
         left join user_profiles tp on tp.user_id = tu.id
         left join bookings b on b.id = r.booking_id
         left join users au on au.id = r.author_user_id
         left join user_profiles ap on ap.user_id = au.id
        where ${conditions.join(" and ")}
        order by r.created_at desc
        limit $${params.length}`,
      params,
    );
  });
}

// ---------------------------------------------------------------------------
// Catalogue, plans, roles
// ---------------------------------------------------------------------------
export interface CatalogItem {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  sortOrder: number;
  isActive: boolean;
  usageCount: number;
  extra?: Record<string, string | number | null>;
}

export interface AdminCatalog {
  subjects: CatalogItem[];
  stages: CatalogItem[];
  areas: CatalogItem[];
  lessonTypes: CatalogItem[];
}

export function getAdminCatalog(): Promise<AdminData<AdminCatalog>> {
  return safe<AdminCatalog>({ subjects: [], stages: [], areas: [], lessonTypes: [] }, async () => {
    const [subjects, stages, areas, lessonTypesRaw] = await Promise.all([
      query<CatalogItem>(
        `select s.id, s.code, s.name_ar as "nameAr", s.name_en as "nameEn",
                s.sort_order as "sortOrder", s.is_active as "isActive",
                (select count(*)::int from tutor_subjects ts where ts.subject_id = s.id) as "usageCount"
           from subjects s order by s.sort_order, s.name_en`,
      ),
      query<CatalogItem>(
        `select s.id, s.code, s.name_ar as "nameAr", s.name_en as "nameEn",
                s.sort_order as "sortOrder", s.is_active as "isActive",
                (select count(*)::int from tutor_stages tg where tg.stage_id = s.id) as "usageCount"
           from educational_stages s order by s.sort_order, s.name_en`,
      ),
      query<CatalogItem>(
        `select a.id, a.code, a.name_ar as "nameAr", a.name_en as "nameEn",
                a.sort_order as "sortOrder", a.is_active as "isActive",
                (select count(*)::int from tutors t where t.area_id = a.id and t.deleted_at is null) as "usageCount"
           from areas a order by a.sort_order, a.name_en`,
      ),
      query<CatalogItem & { defaultDuration: number; priceMultiplier: string; maxStudents: number }>(
        `select l.id, l.code, l.name_ar as "nameAr", l.name_en as "nameEn",
                l.sort_order as "sortOrder", l.is_active as "isActive",
                l.default_duration as "defaultDuration", l.price_multiplier::text as "priceMultiplier",
                l.max_students as "maxStudents",
                (select count(*)::int from bookings b where b.lesson_type_id = l.id) as "usageCount"
           from lesson_types l order by l.sort_order, l.name_en`,
      ),
    ]);
    // `usageCount` is surfaced for all four so the UI can explain why a delete
    // is refused. Only lesson types have numeric settings, and they are folded
    // into `extra` so the shared `CatalogItem` shape stays honest.
    return {
      subjects,
      stages,
      areas,
      lessonTypes: lessonTypesRaw.map(({ defaultDuration, priceMultiplier, maxStudents, ...item }) => ({
        ...item,
        extra: { defaultDuration, priceMultiplier, maxStudents },
      })),
    };
  });
}

export interface PlanAdminRow {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  price: string;
  interval: string;
  durationDays: number;
  graceDays: number;
  isActive: boolean;
  sortOrder: number;
  subscriberCount: number;
}

export function listPlansAdmin(): Promise<AdminData<PlanAdminRow[]>> {
  return safe<PlanAdminRow[]>([], async () =>
    query<PlanAdminRow>(
      `select p.id, p.code, p.name_ar as "nameAr", p.name_en as "nameEn", p.price,
              p.interval, p.duration_days as "durationDays", p.grace_days as "graceDays",
              p.is_active as "isActive", p.sort_order as "sortOrder",
              (select count(*)::int from subscriptions s where s.plan_id = p.id and s.status = 'active') as "subscriberCount"
         from subscription_plans p order by p.sort_order, p.price`,
    ),
  );
}

export interface RoleAdminRow {
  code: string;
  nameAr: string;
  nameEn: string;
  description: string | null;
  userCount: number;
  /** permissions the role grants, per the code-defined matrix */
  permissions: Permission[];
}

/**
 * The RBAC matrix is CODE (see lib/security/rbac.ts): the database rows exist
 * so `user_roles` can be joined, not so the matrix can be edited at runtime.
 * The console therefore reports roles and their grants read-only - editing them
 * here would silently diverge from the server-side checks that enforce access.
 */
export function listRolesAdmin(): Promise<AdminData<RoleAdminRow[]>> {
  return safe<RoleAdminRow[]>([], async () => {
    const rows = await query<{ code: string; name_ar: string; name_en: string; description: string | null; user_count: string }>(
      `select r.code, r.name_ar, r.name_en, r.description,
              (select count(*)::int from user_roles ur where ur.role_id = r.id) as user_count
         from roles r order by r.code`,
    );
    return rows.map((row) => {
      const mapped = ROLE_PERMISSIONS[row.code as RoleCode] ?? [];
      return {
        code: row.code,
        nameAr: row.name_ar,
        nameEn: row.name_en,
        description: row.description,
        userCount: Number(row.user_count),
        permissions: [...mapped],
      };
    });
  });
}

export interface AdminUserOption {
  id: string;
  label: string;
}

export function listAssignableUsers(search?: string): Promise<AdminData<AdminUserOption[]>> {
  return safe<AdminUserOption[]>([], async () => {
    const params: unknown[] = [];
    let condition = "u.deleted_at is null and u.status = 'active'";
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      condition += ` and (lower(u.email) like $1 or lower(coalesce(p.full_name,'')) like $1)`;
    }
    params.push(30);
    return query<AdminUserOption>(
      `select u.id, coalesce(p.full_name, u.email) as label
         from users u left join user_profiles p on p.user_id = u.id
        where ${condition}
        order by u.created_at desc
        limit $${params.length}`,
      params,
    );
  });
}
