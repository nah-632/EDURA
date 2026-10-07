import { z } from "zod";

import { requireUser } from "@/lib/auth/service";
import { createBookingRequest, SlotTakenError, BookingError } from "@/lib/booking/engine";
import { SqlBookingStore, bookingStoreAvailable, nextBookingCode } from "@/lib/booking/sqlStore";
import { query, queryOne, withTransaction } from "@/lib/db";
import { createTranslator, type Locale } from "@/lib/i18n";
import { apiError, getClientIp, getUserAgent, isSameOrigin, jsonResponse, statusForError } from "@/lib/security/http";
import { LIMITS, bucketKey, DbRateLimiter } from "@/lib/security/ratelimit";
import { getBookingSettings } from "@/lib/settings";
import { buildWhatsAppMessage, whatsappLink } from "@/lib/whatsapp/message";
import { localDateOf } from "@/lib/booking/availability";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  tutorId: z.string().min(1),
  studentId: z.string().uuid().optional(),
  student: z
    .object({
      fullName: z.string().trim().min(2).max(120),
      stage: z.string().trim().max(80).optional(),
      grade: z.string().trim().max(40).optional(),
      notes: z.string().trim().max(600).optional(),
    })
    .optional(),
  subjectCode: z.string().trim().min(1).max(60),
  lessonTypeCode: z.string().trim().min(1).max(60),
  method: z.enum(["home", "online"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.number().int().min(30).max(240),
  areaCode: z.string().trim().max(60).optional(),
  addressNote: z.string().trim().max(300).optional(),
  customerNotes: z.string().trim().max(1000).optional(),
  acceptTerms: z.literal(true),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
});

/**
 * POST /api/bookings - create a booking request.
 *
 * Order: origin check -> session -> rate limit -> validation -> engine
 * (which owns availability, pricing and conflict rules). Every failure returns
 * a stable code the UI can translate; driver errors and stack traces never
 * reach the client.
 */
export async function POST(request: Request): Promise<Response> {
  const headers = request.headers;
  if (!isSameOrigin(request, headers)) return apiError("forbidden", 403);

  let session;
  try {
    session = await requireUser(request);
  } catch {
    return apiError("unauthorized", 401);
  }

  const ip = getClientIp(headers);
  const limiter = new DbRateLimiter();
  try {
    const limit = await limiter.hit(
      bucketKey("bookingCreate", session.user.id),
      LIMITS.bookingCreate.limit,
      LIMITS.bookingCreate.windowSeconds,
    );
    if (!limit.allowed) return apiError("rate_limited", 429);
  } catch {
    // A rate-limit backend failure must not silently disable the limit; fall
    // back to rejecting rather than allowing an unbounded burst.
    return apiError("rate_limited", 429);
  }

  if (!bookingStoreAvailable()) return apiError("not_configured", 501);

  let parsed;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return apiError("validation", 422);
  }

  const locale: Locale = session.user.locale;
  const t = createTranslator(locale);

  try {
    // Resolve reference codes to ids server-side (the client never supplies ids
    // for reference data).
    const [subject, lessonType, area, tutorRow] = await Promise.all([
      queryOne<{ id: string }>("select id from subjects where code = $1 and is_active", [parsed.subjectCode]),
      queryOne<{ id: string }>("select id from lesson_types where code = $1 and is_active", [parsed.lessonTypeCode]),
      parsed.areaCode
        ? queryOne<{ id: string }>("select id from areas where code = $1 and is_active", [parsed.areaCode])
        : Promise.resolve(null),
      queryOne<{ id: string; user_id: string; price_per_hour: string }>(
        "select id, user_id, price_per_hour from tutors where (id::text = $1 or slug = $1) and deleted_at is null",
        [parsed.tutorId],
      ),
    ]);

    if (!tutorRow) return apiError("not_found", 404);
    if (!subject) return apiError("validation", 422, "unknown_subject");
    if (!lessonType) return apiError("validation", 422, "unknown_lesson_type");

    // Student: an existing owned record, or a new one created for this booking.
    // A new MINOR always gets a guardian link at creation (slice A+K): the
    // account owner declares the relationship, consent is captured from this
    // very request (ip + user agent), and verification upgrades it later.
    let studentId = parsed.studentId ?? null;
    if (!studentId) {
      if (!parsed.student?.fullName) return apiError("validation", 422, "student_required");
      const createdStudent = await withTransaction(async (tx) => {
        const rows = await tx.query<{ id: string }>(
          `insert into students (owner_user_id, full_name, notes)
           values ($1, $2, $3) returning id`,
          [session.user.id, parsed.student!.fullName, parsed.student!.notes ?? null],
        );
        await tx.query(
          `insert into guardian_links
             (guardian_user_id, student_id, relationship_type, verification_status,
              verification_method, consent_granted_at, consent_ip, consent_user_agent)
           values ($1, $2, 'other', 'pending', 'self_declared', now(), $3, $4)
           on conflict do nothing`,
          [session.user.id, rows[0]!.id, ip, userAgent],
        );
        return rows[0]!;
      });
      studentId = createdStudent.id;
    } else {
      const owned = await queryOne<{ id: string }>("select id from students where id = $1 and owner_user_id = $2", [
        studentId,
        session.user.id,
      ]);
      if (!owned) return apiError("forbidden", 403);
    }

    const settings = await getBookingSettings();
    const now = new Date();
    const store = new SqlBookingStore();

    const created = await createBookingRequest(
      store,
      {
        rules: {
          maxAdvanceDays: settings.maxAdvanceDays,
          minLeadTimeHours: settings.minLeadTimeHours,
          allowedDurations: [30, 45, 60, 90, 120],
        },
        guardianEnforcementStrict: settings.guardianEnforcementStrict,
        now: () => now,
        today: () => localDateOf(now),
        codeFactory: nextBookingCode,
      },
      {
        tutorId: tutorRow.id,
        studentId,
        customerUserId: session.user.id,
        subjectId: subject.id,
        stageId: null,
        lessonTypeId: lessonType.id,
        method: parsed.method,
        date: parsed.date,
        time: parsed.time,
        durationMinutes: parsed.durationMinutes,
        areaId: area?.id ?? null,
        addressNote: parsed.addressNote ?? null,
        customerNotes: parsed.customerNotes ?? null,
        idempotencyKey: parsed.idempotencyKey ?? null,
      },
    );

    // Build the WhatsApp handoff from the record that was just written.
    const [tutorName, subjectName] = await Promise.all([
      queryOne<{ name: string }>(
        `select coalesce(nullif(p.full_name_ar,''), p.full_name) as name
           from tutors t join user_profiles p on p.user_id = t.user_id where t.id = $1`,
        [tutorRow.id],
      ),
      queryOne<{ name_ar: string; name_en: string }>("select name_ar, name_en from subjects where id = $1", [
        subject.id,
      ]),
    ]);

    const message = buildWhatsAppMessage(
      {
        code: created.code,
        studentName: parsed.student?.fullName ?? "",
        tutorName: tutorName?.name ?? "",
        subject: (locale === "ar" ? subjectName?.name_ar : subjectName?.name_en) ?? parsed.subjectCode,
        stage: parsed.student?.stage ?? "",
        lessonType: parsed.lessonTypeCode,
        method: parsed.method,
        date: parsed.date,
        time: parsed.time,
        durationMinutes: parsed.durationMinutes,
        amount: created.amount,
        area: parsed.areaCode ?? null,
        notes: parsed.customerNotes ?? null,
      },
      locale,
    );

    return jsonResponse({
      ok: true,
      booking: {
        id: created.id,
        code: created.code,
        status: created.status,
        amount: created.amount,
        whatsappUrl: process.env.WHATSAPP_TARGET ? whatsappLink(process.env.WHATSAPP_TARGET, message) : null,
        message,
      },
      labels: { paymentInstruction: t("payment.instruction") },
    });
  } catch (err) {
    if (err instanceof SlotTakenError) return apiError("slot_taken", 409);
    if (err instanceof BookingError) {
      const code = err.code === "availability" ? (err.detail === "conflict" ? "slot_taken" : "availability") : err.code;
      return apiError(code, statusForError(code === "slot_taken" ? "slot_taken" : "validation"), err.detail ?? undefined);
    }
    // Internal detail stays in the logs; the client gets a stable code on an
    // unexpected failure so nothing about the schema leaks.
    console.error("[api/bookings] unexpected", {
      ip,
      ua: getUserAgent(headers),
      error: err instanceof Error ? err.message : "unknown",
    });
    return apiError("unexpected", 500);
  }
}
