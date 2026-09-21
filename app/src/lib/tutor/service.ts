/**
 * Tutor-side service: the tutor's own profile, availability, time off and
 * documents (§7.2, §8, §21, §37).
 *
 * A tutor is always addressed through the signed-in user's id: the tutor row is
 * resolved from it, so no request can act on another tutor's profile by sending
 * a different id.
 */
import { query, queryOne, withTransaction, type TxClient } from "@/lib/db";
import { listTutorDocuments, type DocumentMeta } from "@/lib/documents/service";
import { getTutorSubscriptionView, type TutorSubscriptionView } from "@/lib/subscriptions/service";
import { writeAudit, writeAuditTx } from "@/lib/security/audit";
import type { AvailabilityWindow } from "@/lib/booking/availability";
import type { TutorStatus } from "./status";

export interface TutorOwnProfile {
  id: string;
  userId: string;
  slug: string | null;
  status: TutorStatus;
  rejectionReason: string | null;
  headlineAr: string | null;
  headlineEn: string | null;
  bioAr: string | null;
  bioEn: string | null;
  qualification: string | null;
  university: string | null;
  major: string | null;
  graduationYear: number | null;
  yearsExperience: number;
  pricePerHour: string;
  teachesHome: boolean;
  teachesOnline: boolean;
  gender: string | null;
  areaId: string | null;
  areaIds: string[];
  subjectIds: string[];
  stageIds: string[];
  languages: string[];
  fullName: string;
  email: string;
  phone: string;
}

export async function getTutorIdForUser(userId: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `select id from tutors where user_id = $1 and deleted_at is null`,
    [userId],
  );
  return row?.id ?? null;
}

export async function getTutorOwnProfile(userId: string): Promise<TutorOwnProfile | null> {
  const row = await queryOne<{
    id: string;
    user_id: string;
    slug: string | null;
    status: TutorStatus;
    rejection_reason: string | null;
    headline_ar: string | null;
    headline_en: string | null;
    bio_ar: string | null;
    bio_en: string | null;
    qualification: string | null;
    university: string | null;
    major: string | null;
    graduation_year: number | null;
    years_experience: number;
    price_per_hour: string;
    teaches_home: boolean;
    teaches_online: boolean;
    gender: string | null;
    area_id: string | null;
    languages: string[] | null;
    full_name: string | null;
    email: string;
    phone: string;
    area_ids: string[] | null;
    subject_ids: string[] | null;
    stage_ids: string[] | null;
  }>(
    `select t.id, t.user_id, t.slug, t.status::text as status, t.rejection_reason,
            t.headline_ar, t.headline_en, t.bio_ar, t.bio_en, t.qualification, t.university,
            t.major, t.graduation_year, t.years_experience, t.price_per_hour,
            t.teaches_home, t.teaches_online, t.gender, t.area_id, t.languages,
            coalesce(p.full_name_ar, p.full_name) as full_name, u.email, u.phone,
            (select array_agg(ta.area_id) from tutor_areas ta where ta.tutor_id = t.id) as area_ids,
            (select array_agg(ts.subject_id) from tutor_subjects ts where ts.tutor_id = t.id) as subject_ids,
            (select array_agg(tg.stage_id) from tutor_stages tg where tg.tutor_id = t.id) as stage_ids
       from tutors t
       join users u on u.id = t.user_id
       left join user_profiles p on p.user_id = u.id
      where t.user_id = $1 and t.deleted_at is null`,
    [userId],
  );
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    slug: row.slug,
    status: row.status,
    rejectionReason: row.rejection_reason,
    headlineAr: row.headline_ar,
    headlineEn: row.headline_en,
    bioAr: row.bio_ar,
    bioEn: row.bio_en,
    qualification: row.qualification,
    university: row.university,
    major: row.major,
    graduationYear: row.graduation_year,
    yearsExperience: row.years_experience,
    pricePerHour: row.price_per_hour,
    teachesHome: row.teaches_home,
    teachesOnline: row.teaches_online,
    gender: row.gender,
    areaId: row.area_id,
    areaIds: row.area_ids ?? [],
    subjectIds: row.subject_ids ?? [],
    stageIds: row.stage_ids ?? [],
    languages: row.languages ?? ["ar"],
    fullName: row.full_name ?? row.email,
    email: row.email,
    phone: row.phone,
  };
}

export interface TutorProfileInput {
  headlineAr: string;
  headlineEn: string;
  bioAr: string;
  bioEn: string;
  qualification: string;
  university?: string | null;
  major?: string | null;
  graduationYear?: number | null;
  yearsExperience: number;
  pricePerHour: string;
  teachesHome: boolean;
  teachesOnline: boolean;
  gender?: "male" | "female" | null;
  areaId?: string | null;
  areaIds: string[];
  subjectIds: string[];
  stageIds: string[];
  languages: ("ar" | "en")[];
}

/**
 * Save the tutor's own profile. A rejected profile that is edited returns to
 * `pending` - the platform re-reviews what changed rather than leaving a
 * rejected profile silently live after an edit.
 *
 * Association tables (subjects, stages, areas) are REPLACED inside the
 * transaction: they are a set, and merging would make "remove a subject"
 * impossible.
 */
export async function saveTutorProfile(
  userId: string,
  input: TutorProfileInput,
): Promise<{ tutorId: string; status: string }> {
  return withTransaction(async (tx: TxClient) => {
    const current = await tx.one<{ id: string; status: string; submitted_at: Date | null }>(
      `select id, status::text as status, submitted_at from tutors where user_id = $1 and deleted_at is null for update`,
      [userId],
    );
    if (!current) throw new Error("not_found");

    const nextStatus = current.status === "rejected" ? "pending" : current.status;

    await tx.query(
      `update tutors
          set headline_ar = $2, headline_en = $3, bio_ar = $4, bio_en = $5,
              qualification = $6, university = $7, major = $8, graduation_year = $9,
              years_experience = $10, price_per_hour = $11::numeric,
              teaches_home = $12, teaches_online = $13, gender = $14, area_id = $15,
              languages = $16::text[], status = $17::tutor_status,
              submitted_at = coalesce(submitted_at, now()),
              rejection_reason = case when $17 = 'pending' then null else rejection_reason end
        where id = $1`,
      [
        current.id,
        input.headlineAr,
        input.headlineEn,
        input.bioAr,
        input.bioEn,
        input.qualification,
        input.university ?? null,
        input.major ?? null,
        input.graduationYear ?? null,
        input.yearsExperience,
        input.pricePerHour,
        input.teachesHome,
        input.teachesOnline,
        input.gender ?? null,
        input.areaId ?? null,
        input.languages,
        nextStatus,
      ],
    );

    await tx.query(`delete from tutor_subjects where tutor_id = $1`, [current.id]);
    if (input.subjectIds.length > 0) {
      await tx.query(
        `insert into tutor_subjects (tutor_id, subject_id)
         select $1, unnest($2::uuid[])`,
        [current.id, input.subjectIds],
      );
    }
    await tx.query(`delete from tutor_stages where tutor_id = $1`, [current.id]);
    if (input.stageIds.length > 0) {
      await tx.query(`insert into tutor_stages (tutor_id, stage_id) select $1, unnest($2::uuid[])`, [
        current.id,
        input.stageIds,
      ]);
    }
    await tx.query(`delete from tutor_areas where tutor_id = $1`, [current.id]);
    if (input.areaIds.length > 0) {
      await tx.query(`insert into tutor_areas (tutor_id, area_id) select $1, unnest($2::uuid[])`, [
        current.id,
        input.areaIds,
      ]);
    }

    await writeAuditTx(tx, {
      actorUserId: userId,
      actorLabel: null,
      action: "tutor.profile_saved",
      entity: "tutors",
      entityId: current.id,
      before: { status: current.status },
      after: { status: nextStatus, subjects: input.subjectIds.length, stages: input.stageIds.length },
    });

    return { tutorId: current.id, status: nextStatus };
  });
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------
export async function listAvailability(tutorId: string): Promise<AvailabilityWindow[]> {
  const rows = await query<{ weekday: number; start_time: string; end_time: string; method: string | null }>(
    `select weekday, to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time, method::text as method
       from tutor_availability where tutor_id = $1 order by weekday, start_time`,
    [tutorId],
  );
  return rows.map((row) => ({
    weekday: row.weekday,
    startTime: row.start_time,
    endTime: row.end_time,
  }));
}

export interface AvailabilityInput {
  weekday: number;
  startTime: string;
  endTime: string;
  method?: "home" | "online" | null;
}

/** Replace the weekly template. The client calendar is never the source of
 *  truth - this is the table the booking engine validates against (§23). */
export async function saveAvailability(userId: string, tutorId: string, windows: AvailabilityInput[]): Promise<void> {
  await withTransaction(async (tx: TxClient) => {
    await tx.query(`delete from tutor_availability where tutor_id = $1`, [tutorId]);
    for (const window of windows) {
      await tx.query(
        `insert into tutor_availability (tutor_id, weekday, start_time, end_time, method)
         values ($1, $2, $3::time, $4::time, $5::teaching_method)`,
        [tutorId, window.weekday, window.startTime, window.endTime, window.method ?? null],
      );
    }
    await writeAuditTx(tx, {
      actorUserId: userId,
      actorLabel: null,
      action: "tutor.availability_saved",
      entity: "tutor_availability",
      entityId: tutorId,
      after: { windows: windows.length },
    });
  });
}

/** Upcoming blocks, so the tutor can see and undo what they entered. */
export async function listTimeOff(
  tutorId: string,
): Promise<{ id: string; startsAt: string; endsAt: string; reason: string | null }[]> {
  const rows = await query<{ id: string; starts_at: string; ends_at: string; reason: string | null }>(
    `select id, to_char(starts_at, 'YYYY-MM-DD"T"HH24:MI') as starts_at,
            to_char(ends_at, 'YYYY-MM-DD"T"HH24:MI') as ends_at, reason
       from tutor_time_off
      where tutor_id = $1 and ends_at >= now()
      order by starts_at`,
    [tutorId],
  );
  return rows.map((row) => ({ id: row.id, startsAt: row.starts_at, endsAt: row.ends_at, reason: row.reason }));
}

export async function addTimeOff(
  userId: string,
  tutorId: string,
  params: { startsAt: string; endsAt: string; reason?: string | null },
): Promise<{ id: string }> {
  const rows = await query<{ id: string }>(
    `insert into tutor_time_off (tutor_id, starts_at, ends_at, reason)
     values ($1, $2::timestamptz, $3::timestamptz, $4) returning id`,
    [tutorId, params.startsAt, params.endsAt, params.reason ?? null],
  );
  await writeAudit({
    actorUserId: userId,
    actorLabel: null,
    action: "tutor.time_off_added",
    entity: "tutor_time_off",
    entityId: rows[0]!.id,
    after: { tutor_id: tutorId, starts_at: params.startsAt, ends_at: params.endsAt },
  });
  return { id: rows[0]!.id };
}

export async function removeTimeOff(userId: string, tutorId: string, id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `delete from tutor_time_off where id = $1 and tutor_id = $2 returning id`,
    [id, tutorId],
  );
  if (!rows[0]) return false;
  await writeAudit({
    actorUserId: userId,
    actorLabel: null,
    action: "tutor.time_off_removed",
    entity: "tutor_time_off",
    entityId: id,
  });
  return true;
}

/** Everything the tutor dashboard needs in one call. */
export interface TutorDashboard {
  profile: TutorOwnProfile;
  documents: DocumentMeta[];
  subscription: TutorSubscriptionView;
}

export async function getTutorDashboard(userId: string): Promise<TutorDashboard | null> {
  const profile = await getTutorOwnProfile(userId);
  if (!profile) return null;
  const [documents, subscription] = await Promise.all([
    listTutorDocuments(profile.id),
    getTutorSubscriptionView(profile.id),
  ]);
  return { profile, documents, subscription };
}
