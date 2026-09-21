/**
 * Public tutor reads.
 *
 * Every query here runs against the `public_tutors` view (approved + active
 * account + valid subscription) or repeats the same predicate explicitly, so a
 * suspended tutor or an expired subscription can never leak into search.
 * Only public columns are selected: no email, no phone, no documents.
 */
import { dbConfigured, query } from "@/lib/db";
import { type Locale } from "@/lib/i18n";
import { DEMO_TUTORS } from "./demo";

export interface TutorCardData {
  id: string;
  slug: string;
  name: string;
  headline: string;
  qualification: string;
  subjects: string[];
  stages: string[];
  area: string;
  yearsExperience: number;
  pricePerHour: string;
  ratingAvg: string | null;
  ratingCount: number;
  completedLessons: number;
  teachesHome: boolean;
  teachesOnline: boolean;
  languages: string[];
  verified: boolean;
  bio: string;
}

export interface TutorFilters {
  subject?: string;
  stage?: string;
  area?: string;
  method?: "home" | "online";
  minPrice?: string;
  maxPrice?: string;
  minRating?: number;
  minExperience?: number;
  sort?: "rating" | "priceAsc" | "priceDesc" | "experience" | "newest";
  limit?: number;
  offset?: number;
}

interface TutorRow {
  id: string;
  slug: string | null;
  name: string;
  headline: string | null;
  qualification: string | null;
  subjects: string[] | null;
  stages: string[] | null;
  area: string | null;
  years_experience: number;
  price_per_hour: string;
  rating_avg: string;
  rating_count: number;
  completed_lessons: number;
  teaches_home: boolean;
  teaches_online: boolean;
  languages: string[] | null;
  approved_at: string | null;
  bio: string | null;
}

function mapTutor(row: TutorRow): TutorCardData {
  return {
    id: row.id,
    slug: row.slug ?? row.id,
    name: row.name,
    headline: row.headline ?? "",
    qualification: row.qualification ?? "",
    subjects: row.subjects ?? [],
    stages: row.stages ?? [],
    area: row.area ?? "",
    yearsExperience: row.years_experience,
    pricePerHour: row.price_per_hour,
    ratingAvg: row.rating_count > 0 ? row.rating_avg : null,
    ratingCount: row.rating_count,
    completedLessons: row.completed_lessons,
    teachesHome: row.teaches_home,
    teachesOnline: row.teaches_online,
    languages: row.languages ?? [],
    verified: Boolean(row.approved_at),
    bio: row.bio ?? "",
  };
}

const ORDER_BY: Record<NonNullable<TutorFilters["sort"]>, string> = {
  rating: "t.rating_avg desc, t.rating_count desc",
  priceAsc: "t.price_per_hour asc",
  priceDesc: "t.price_per_hour desc",
  experience: "t.years_experience desc",
  newest: "t.approved_at desc nulls last",
};

/**
 * Filtered, paginated listing. Filter values arrive as codes from the URL and
 * are compared against reference codes (never string-concatenated into SQL).
 */
export async function listPublicTutors(
  locale: Locale,
  filters: TutorFilters = {},
): Promise<TutorCardData[]> {
  if (!dbConfigured()) {
    const demo = DEMO_TUTORS[locale];
    return filters.limit ? demo.slice(0, filters.limit) : demo;
  }

  const params: unknown[] = [locale];
  const conditions: string[] = ["true"];
  const push = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.subject) {
    const p = push(filters.subject);
    conditions.push(
      `exists (select 1 from tutor_subjects ts join subjects s on s.id = ts.subject_id
                where ts.tutor_id = t.id and s.code = ${p} and s.is_active)`,
    );
  }
  if (filters.stage) {
    const p = push(filters.stage);
    conditions.push(
      `exists (select 1 from tutor_stages tg join educational_stages es on es.id = tg.stage_id
                where tg.tutor_id = t.id and es.code = ${p} and es.is_active)`,
    );
  }
  if (filters.area) {
    const p = push(filters.area);
    conditions.push(
      `(exists (select 1 from tutor_areas ta join areas a on a.id = ta.area_id
                 where ta.tutor_id = t.id and a.code = ${p})
        or exists (select 1 from areas a2 where a2.id = t.area_id and a2.code = ${p}))`,
    );
  }
  if (filters.method === "home") conditions.push("t.teaches_home");
  if (filters.method === "online") conditions.push("t.teaches_online");
  if (filters.minPrice) {
    const p = push(filters.minPrice);
    conditions.push(`t.price_per_hour >= ${p}::numeric`);
  }
  if (filters.maxPrice) {
    const p = push(filters.maxPrice);
    conditions.push(`t.price_per_hour <= ${p}::numeric`);
  }
  if (filters.minRating) {
    const p = push(filters.minRating);
    conditions.push(`t.rating_avg >= ${p}::numeric`);
  }
  if (filters.minExperience) {
    const p = push(filters.minExperience);
    conditions.push(`t.years_experience >= ${p}::int`);
  }

  const order = ORDER_BY[filters.sort ?? "rating"];
  const limit = push(Math.min(filters.limit ?? 12, 48));
  const offset = push(filters.offset ?? 0);
  const sql = `
    select
      t.id,
      t.slug,
      case when $1 = 'ar' then coalesce(nullif(p.full_name_ar, ''), p.full_name) else p.full_name end as name,
      case when $1 = 'ar' then t.headline_ar else t.headline_en end as headline,
      case when $1 = 'ar' then t.bio_ar else t.bio_en end as bio,
      t.qualification,
      t.years_experience,
      t.price_per_hour,
      t.rating_avg,
      t.rating_count,
      t.completed_lessons,
      t.teaches_home,
      t.teaches_online,
      t.languages,
      t.approved_at,
      case when $1 = 'ar' then a.name_ar else a.name_en end as area,
      (select array_agg(case when $1 = 'ar' then s.name_ar else s.name_en end order by s.sort_order)
         from tutor_subjects ts join subjects s on s.id = ts.subject_id where ts.tutor_id = t.id) as subjects,
      (select array_agg(case when $1 = 'ar' then es.name_ar else es.name_en end order by es.sort_order)
         from tutor_stages tg join educational_stages es on es.id = tg.stage_id where tg.tutor_id = t.id) as stages
    from public_tutors t
    join user_profiles p on p.user_id = t.user_id
    left join areas a on a.id = t.area_id
    where ${conditions.join(" and ")}
    order by ${order}
    limit ${limit} offset ${offset}
  `;

  try {
    const rows = await query<TutorRow>(sql, params);
    return rows.map(mapTutor);
  } catch {
    return DEMO_TUTORS[locale];
  }
}

export async function countPublicTutors(filters: TutorFilters = {}): Promise<number> {
  if (!dbConfigured()) return DEMO_TUTORS.ar.length;
  const rows = await listPublicTutors("en", { ...filters, limit: 48, offset: 0 });
  return rows.length;
}

/** Single tutor by slug or id; returns null when not publicly listable. */
export async function getPublicTutor(locale: Locale, slug: string): Promise<TutorCardData | null> {
  if (!dbConfigured()) {
    return DEMO_TUTORS[locale].find((t) => t.slug === slug) ?? null;
  }
  const rows = await query<TutorRow>(
    `select
        t.id, t.slug,
        case when $1 = 'ar' then coalesce(nullif(p.full_name_ar, ''), p.full_name) else p.full_name end as name,
        case when $1 = 'ar' then t.headline_ar else t.headline_en end as headline,
        case when $1 = 'ar' then t.bio_ar else t.bio_en end as bio,
        t.qualification, t.years_experience, t.price_per_hour, t.rating_avg, t.rating_count,
        t.completed_lessons, t.teaches_home, t.teaches_online, t.languages, t.approved_at,
        case when $1 = 'ar' then a.name_ar else a.name_en end as area,
        (select array_agg(case when $1 = 'ar' then s.name_ar else s.name_en end order by s.sort_order)
           from tutor_subjects ts join subjects s on s.id = ts.subject_id where ts.tutor_id = t.id) as subjects,
        (select array_agg(case when $1 = 'ar' then es.name_ar else es.name_en end order by es.sort_order)
           from tutor_stages tg join educational_stages es on es.id = tg.stage_id where tg.tutor_id = t.id) as stages
      from public_tutors t
      join user_profiles p on p.user_id = t.user_id
      left join areas a on a.id = t.area_id
      where t.slug = $2 or t.id::text = $2
      limit 1`,
    [locale, slug],
  );
  const row = rows[0];
  return row ? mapTutor(row) : null;
}

export interface TutorAvailabilityRow {
  weekday: number;
  startTime: string;
  endTime: string;
}

export async function getTutorAvailability(tutorId: string): Promise<TutorAvailabilityRow[]> {
  if (!dbConfigured()) return [];
  const rows = await query<{ weekday: number; start_time: string; end_time: string }>(
    `select weekday, start_time::text as start_time, end_time::text as end_time
       from tutor_availability where tutor_id = $1 order by weekday, start_time`,
    [tutorId],
  );
  return rows.map((r) => ({ weekday: r.weekday, startTime: r.start_time.slice(0, 5), endTime: r.end_time.slice(0, 5) }));
}
