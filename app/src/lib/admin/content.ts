/**
 * Audited admin mutations for CONTENT and CONFIGURATION: the catalogue,
 * subscription plans, platform settings, CMS text, announcement composition and
 * review moderation (§15, §16, §17, §19, §38, §41).
 *
 * Business settings are data, not code: everything an operator may need to
 * change about how the platform behaves lives in the `settings` table, and the
 * default in `lib/settings.ts` is only the first-boot value. That is why the
 * settings and CMS actions write through `saveSettings` instead of shipping a
 * new deployment.
 */
import { query, queryOne, withTransaction, type TxClient } from "@/lib/db";
import { composeAnnouncement, resolveAudience } from "@/lib/notifications/service";
import { applyModeration, type ModerationOutcome } from "@/lib/reviews/service";
import { moderationTarget, type ReviewModerationAction, type ReviewStatus } from "@/lib/reviews/rules";
import { writeAudit, writeAuditTx } from "@/lib/security/audit";
import { invalidateSettingsCache, saveSettings, type PlatformSettings } from "@/lib/settings";
import { CMS_KEY, invalidateCmsCache, readCmsContent, type CmsContent } from "@/lib/cms/public";
import { ActionError } from "./actions";
import type { AdminContext } from "./guard";

function auditBase(ctx: AdminContext) {
  return {
    actorUserId: ctx.actorUserId,
    actorLabel: ctx.actorLabel,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  };
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
/**
 * Reference tables the console may edit. The identifier is chosen from this
 * map, never from request data, so a table name can never be injected.
 */
const CATALOG_TABLES = {
  subjects: { table: "subjects", label: "subjects" },
  stages: { table: "educational_stages", label: "stages" },
  areas: { table: "areas", label: "areas" },
  lessonTypes: { table: "lesson_types", label: "lesson_types" },
} as const;

export type CatalogKind = keyof typeof CATALOG_TABLES;

export interface CatalogInput {
  kind: CatalogKind;
  id?: string | null;
  code: string;
  nameAr: string;
  nameEn: string;
  sortOrder: number;
  isActive: boolean;
  defaultDuration?: number | null;
  priceMultiplier?: string | null;
  maxStudents?: number | null;
}

export async function upsertCatalogItem(ctx: AdminContext, input: CatalogInput): Promise<{ id: string }> {
  const { table } = CATALOG_TABLES[input.kind];
  const isLessonType = input.kind === "lessonTypes";

  const id = await withTransaction(async (tx: TxClient) => {
    let resultId: string;
    if (input.id && isLessonType) {
      const rows = await tx.query<{ id: string }>(
        `update lesson_types
            set code = $2, name_ar = $3, name_en = $4, sort_order = $5, is_active = $6,
                default_duration = coalesce($7, default_duration),
                price_multiplier = coalesce($8::numeric, price_multiplier),
                max_students = coalesce($9, max_students)
          where id = $1 returning id`,
        [
          input.id,
          input.code,
          input.nameAr,
          input.nameEn,
          input.sortOrder,
          input.isActive,
          input.defaultDuration ?? null,
          input.priceMultiplier ?? null,
          input.maxStudents ?? null,
        ],
      );
      const row = rows[0];
      if (!row) throw new ActionError("not_found");
      resultId = row.id;
    } else if (input.id) {
      const rows = await tx.query<{ id: string }>(
        `update ${table}
            set code = $2, name_ar = $3, name_en = $4, sort_order = $5, is_active = $6
          where id = $1 returning id`,
        [input.id, input.code, input.nameAr, input.nameEn, input.sortOrder, input.isActive],
      );
      const row = rows[0];
      if (!row) throw new ActionError("not_found");
      resultId = row.id;
    } else if (isLessonType) {
      const rows = await tx.query<{ id: string }>(
        `insert into ${table} (code, name_ar, name_en, sort_order, is_active, default_duration, price_multiplier, max_students)
         values ($1, $2, $3, $4, $5, coalesce($6, 60), coalesce($7::numeric, 1.000), coalesce($8, 1))
         returning id`,
        [
          input.code,
          input.nameAr,
          input.nameEn,
          input.sortOrder,
          input.isActive,
          input.defaultDuration ?? null,
          input.priceMultiplier ?? null,
          input.maxStudents ?? null,
        ],
      );
      resultId = rows[0]!.id;
    } else {
      const rows = await tx.query<{ id: string }>(
        `insert into ${table} (code, name_ar, name_en, sort_order, is_active)
         values ($1, $2, $3, $4, $5) returning id`,
        [input.code, input.nameAr, input.nameEn, input.sortOrder, input.isActive],
      );
      resultId = rows[0]!.id;
    }

    await writeAuditTx(tx, {
      ...auditBase(ctx),
      action: input.id ? "catalog.update" : "catalog.create",
      entity: CATALOG_TABLES[input.kind].label,
      entityId: resultId,
      after: { code: input.code, name_ar: input.nameAr, name_en: input.nameEn, is_active: input.isActive },
    });
    return resultId;
  });

  return { id };
}

/**
 * Deactivate instead of delete. Reference rows are referenced by historic
 * bookings and tutor profiles; removing one would either break those rows or
 * silently rewrite history, so the catalogue only ever hides.
 */
export async function deactivateCatalogItem(ctx: AdminContext, kind: CatalogKind, id: string): Promise<void> {
  const { table, label } = CATALOG_TABLES[kind];
  await withTransaction(async (tx: TxClient) => {
    const rows = await tx.query<{ id: string }>(
      `update ${table} set is_active = false where id = $1 returning id`,
      [id],
    );
    if (!rows[0]) throw new ActionError("not_found");
    await writeAuditTx(tx, {
      ...auditBase(ctx),
      action: "catalog.deactivate",
      entity: label,
      entityId: id,
      after: { is_active: false },
    });
  });
}

export async function activateCatalogItem(ctx: AdminContext, kind: CatalogKind, id: string): Promise<void> {
  const { table, label } = CATALOG_TABLES[kind];
  await withTransaction(async (tx: TxClient) => {
    const rows = await tx.query<{ id: string }>(
      `update ${table} set is_active = true where id = $1 returning id`,
      [id],
    );
    if (!rows[0]) throw new ActionError("not_found");
    await writeAuditTx(tx, {
      ...auditBase(ctx),
      action: "catalog.activate",
      entity: label,
      entityId: id,
      after: { is_active: true },
    });
  });
}

// ---------------------------------------------------------------------------
// Subscription plans
// ---------------------------------------------------------------------------
export interface PlanInput {
  id?: string | null;
  code: string;
  nameAr: string;
  nameEn: string;
  price: string;
  interval: "monthly" | "annual" | "one_time";
  durationDays: number;
  graceDays: number;
  isActive: boolean;
  sortOrder: number;
}

export async function upsertPlan(ctx: AdminContext, input: PlanInput): Promise<{ id: string }> {
  const id = await withTransaction(async (tx: TxClient) => {
    let resultId: string;
    if (input.id) {
      const rows = await tx.query<{ id: string }>(
        `update subscription_plans
            set code = $2, name_ar = $3, name_en = $4, price = $5::numeric, interval = $6,
                duration_days = $7, grace_days = $8, is_active = $9, sort_order = $10
          where id = $1 returning id`,
        [
          input.id,
          input.code,
          input.nameAr,
          input.nameEn,
          input.price,
          input.interval,
          input.durationDays,
          input.graceDays,
          input.isActive,
          input.sortOrder,
        ],
      );
      const row = rows[0];
      if (!row) throw new ActionError("not_found");
      resultId = row.id;
    } else {
      const rows = await tx.query<{ id: string }>(
        `insert into subscription_plans
           (code, name_ar, name_en, price, interval, duration_days, grace_days, is_active, sort_order)
         values ($1, $2, $3, $4::numeric, $5, $6, $7, $8, $9)
         returning id`,
        [
          input.code,
          input.nameAr,
          input.nameEn,
          input.price,
          input.interval,
          input.durationDays,
          input.graceDays,
          input.isActive,
          input.sortOrder,
        ],
      );
      resultId = rows[0]!.id;
    }

    await writeAuditTx(tx, {
      ...auditBase(ctx),
      action: input.id ? "plan.update" : "plan.create",
      entity: "subscription_plans",
      entityId: resultId,
      after: {
        code: input.code,
        price: input.price,
        interval: input.interval,
        duration_days: input.durationDays,
        grace_days: input.graceDays,
        is_active: input.isActive,
      },
    });
    return resultId;
  });
  return { id };
}

// ---------------------------------------------------------------------------
// Platform settings + CMS
// ---------------------------------------------------------------------------
export async function updatePlatformSettings(ctx: AdminContext, patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
  const before = await currentSettingsRow();
  const next = await saveSettings(patch, ctx.actorUserId);
  invalidateSettingsCache();
  await writeAudit({
    ...auditBase(ctx),
    action: "settings.update",
    entity: "settings",
    entityId: "platform",
    before,
    after: patch,
  });
  return next;
}

async function currentSettingsRow(): Promise<unknown> {
  const row = await queryOne<{ value: unknown }>(`select value from settings where key = 'platform'`);
  return row?.value ?? null;
}

/** CMS content lives under its own settings key so a content edit never risks
 * touching booking rules (they are different jobs, done by different people).
 * The type and the tolerant reader live in lib/cms/public.ts, next to the pages
 * that render them, so the editor and the renderer share one contract. */
export async function updateCmsContent(ctx: AdminContext, patch: CmsContent): Promise<CmsContent> {
  const before = await readCmsContent();
  const next: CmsContent = { ...before, ...patch };
  await query(
    `insert into settings (key, value, updated_by, updated_at)
     values ($1, $2::jsonb, $3, now())
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [CMS_KEY, JSON.stringify(next), ctx.actorUserId],
  );
  // Invalidate AFTER the write: clearing first would let a concurrent render
  // re-cache the value we are replacing.
  invalidateCmsCache();
  await writeAudit({
    ...auditBase(ctx),
    action: "cms.update",
    entity: "settings",
    entityId: CMS_KEY,
    before,
    after: patch,
  });
  return next;
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------
export async function sendAnnouncement(
  ctx: AdminContext,
  input: {
    audience: "all" | "students" | "tutors" | "user" | "tutor";
    audienceId?: string | null;
    titleAr: string;
    titleEn: string;
    bodyAr: string;
    bodyEn: string;
  },
): Promise<{ recipients: number; sent: number; skipped: number; failed: number }> {
  // Count first with the SAME predicate the send uses, so the number the admin
  // approves is the number of people the message can reach.
  const recipients = await resolveAudience(input.audience, input.audienceId);
  const delivery = await composeAnnouncement(input);
  await writeAudit({
    ...auditBase(ctx),
    action: "notification.compose",
    entity: "notifications",
    entityId: null,
    after: {
      audience: input.audience,
      audience_id: input.audienceId ?? null,
      title_ar: input.titleAr,
      resolved_recipients: recipients.length,
      sent: delivery.sent,
      skipped: delivery.skipped,
    },
  });
  return { recipients: recipients.length, sent: delivery.sent, skipped: delivery.skipped, failed: delivery.failed };
}

// ---------------------------------------------------------------------------
// Review moderation
// ---------------------------------------------------------------------------
export async function moderateReview(
  ctx: AdminContext,
  params: { reviewId: string; action: ReviewModerationAction; note?: string | null },
): Promise<ModerationOutcome & { status: ReviewStatus }> {
  const review = await queryOne<{ id: string; status: ReviewStatus }>(
    `select id, status::text as status from reviews where id = $1`,
    [params.reviewId],
  );
  if (!review) throw new ActionError("not_found");

  const target = moderationTarget(params.action, review.status);
  if (!target) throw new ActionError("invalid_transition", `${review.status} -> ${params.action}`);

  if ((params.action === "hide" || params.action === "report") && (!params.note || params.note.trim().length < 3)) {
    throw new ActionError("reason_required", params.action);
  }

  const outcome = await applyModeration({
    reviewId: params.reviewId,
    status: target,
    moderatedBy: ctx.actorUserId,
    note: params.note ?? null,
  });

  await writeAudit({
    ...auditBase(ctx),
    action: `review.${params.action}`,
    entity: "reviews",
    entityId: params.reviewId,
    reason: params.note ?? null,
    before: { status: review.status },
    after: { status: target },
  });

  return { ...outcome, status: target };
}
