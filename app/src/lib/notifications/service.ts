/**
 * Notification service.
 *
 * Delivery goes through the NotificationProvider interface (§14), so swapping
 * the in-app implementation for a real WhatsApp/SMS/push integration later does
 * not touch a single caller. Two things live HERE rather than in the provider,
 * because they are product rules, not transport:
 *
 *  1. Recipients who turned a category off do not receive it (the provider
 *     would have no way to know).
 *  2. The resolved recipient list is returned to the caller, so the admin
 *     console can show how many people a message actually reached (§15) instead
 *     of claiming success.
 */
import { query, queryOne } from "@/lib/db";
import { notificationProvider } from "@/lib/providers";
import { audiencePredicate, audienceTakesId, isEnabled, type NotificationPrefs } from "./catalog";

export interface NotificationRow {
  id: string;
  type: string;
  params: Record<string, unknown>;
  entityType: string | null;
  entityId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface DeliverInput {
  userIds: string[];
  type: string;
  params?: Record<string, unknown>;
  entityType?: string | null;
  entityId?: string | null;
  /** skip the preference check - used for messages the account cannot opt out of */
  bypassPreferences?: boolean;
}

export interface DeliveryResult {
  /** recipients the notification was actually written for */
  sent: number;
  /** recipients skipped because the category is disabled */
  skipped: number;
  failed: number;
}

async function prefsFor(userIds: string[]): Promise<Map<string, NotificationPrefs>> {
  const map = new Map<string, NotificationPrefs>();
  if (userIds.length === 0) return map;
  const rows = await query<{ user_id: string; notification_prefs: NotificationPrefs | null }>(
    `select user_id, notification_prefs from user_profiles where user_id = any($1::uuid[])`,
    [userIds],
  );
  for (const row of rows) map.set(row.user_id, row.notification_prefs ?? {});
  return map;
}

/**
 * Fan out one notification to many recipients, honouring preferences.
 *
 * A failure to read preferences must not silently drop a booking
 * confirmation, so an error there falls back to sending (the preference screen
 * is a convenience; the notification is the contract).
 */
export async function deliver(input: DeliverInput): Promise<DeliveryResult> {
  const unique = [...new Set(input.userIds)].filter(Boolean);
  if (unique.length === 0) return { sent: 0, skipped: 0, failed: 0 };

  let recipients = unique;
  let skipped = 0;
  if (!input.bypassPreferences) {
    try {
      const prefs = await prefsFor(unique);
      recipients = unique.filter((id) => isEnabled(prefs.get(id) ?? {}, input.type));
      skipped = unique.length - recipients.length;
    } catch {
      recipients = unique;
    }
  }

  const provider = notificationProvider();
  const result = await provider.sendMany(
    recipients.map((userId) => ({
      userId,
      type: input.type,
      params: input.params ?? {},
      entityType: input.entityType ?? undefined,
      entityId: input.entityId ?? undefined,
    })),
  );
  return { sent: result.sent, skipped, failed: result.failed };
}

/** Single-recipient convenience wrapper. */
export async function notifyUser(
  userId: string,
  type: string,
  params: Record<string, unknown> = {},
  entity?: { type: string; id: string },
): Promise<void> {
  await deliver({
    userIds: [userId],
    type,
    params,
    entityType: entity?.type ?? null,
    entityId: entity?.id ?? null,
  });
}

export async function notifyMany(
  userIds: string[],
  type: string,
  params: Record<string, unknown> = {},
  entity?: { type: string; id: string },
): Promise<DeliveryResult> {
  return deliver({
    userIds,
    type,
    params,
    entityType: entity?.type ?? null,
    entityId: entity?.id ?? null,
  });
}

// ---------------------------------------------------------------------------
// Reads (account area)
// ---------------------------------------------------------------------------
export async function listNotifications(userId: string, limit = 50): Promise<NotificationRow[]> {
  const rows = await query<{
    id: string;
    type: string;
    params: Record<string, unknown>;
    entity_type: string | null;
    entity_id: string | null;
    read_at: Date | null;
    created_at: Date;
  }>(
    `select id, type, params, entity_type, entity_id, read_at, created_at
       from notifications
      where user_id = $1
      order by created_at desc
      limit $2`,
    [userId, Math.min(Math.max(limit, 1), 200)],
  );
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    params: row.params ?? {},
    entityType: row.entity_type,
    entityId: row.entity_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

export async function unreadCount(userId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `select count(*)::text as count from notifications where user_id = $1 and read_at is null`,
    [userId],
  );
  return Number(row?.count ?? 0);
}

/**
 * Mark notifications read. `ids` is scoped by `user_id` in the WHERE clause, so
 * guessing another account's notification id matches nothing - the userId is
 * never taken from the request.
 */
export async function markRead(userId: string, ids: string[] | "all"): Promise<number> {
  const rows =
    ids === "all"
      ? await query<{ id: string }>(
          `update notifications set read_at = now() where user_id = $1 and read_at is null returning id`,
          [userId],
        )
      : await query<{ id: string }>(
          `update notifications set read_at = now()
            where user_id = $1 and read_at is null and id = any($2::uuid[])
          returning id`,
          [userId, ids.slice(0, 200)],
        );
  return rows.length;
}

// ---------------------------------------------------------------------------
// Admin compose
// ---------------------------------------------------------------------------
export interface ComposeInput {
  audience: "all" | "students" | "tutors" | "user" | "tutor";
  audienceId?: string | null;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
}

/**
 * Resolve an audience to concrete user ids. The predicate is shared with the
 * count shown in the console (audiencePredicate), so "will reach N people" and
 * "actually reached N people" cannot disagree.
 */
export async function resolveAudience(
  audience: ComposeInput["audience"],
  audienceId?: string | null,
): Promise<string[]> {
  const { where, params } = audiencePredicate(audience, audienceId);
  // A targeted audience without a target selects nobody rather than everybody.
  if (audienceTakesId(audience) && !audienceId) return [];
  const rows = await query<{ id: string }>(`select u.id from users u where ${where}`, params);
  return rows.map((row) => row.id);
}

export async function composeAnnouncement(input: ComposeInput): Promise<DeliveryResult> {
  const recipients = await resolveAudience(input.audience, input.audienceId);
  return notifyMany(recipients, "announcement", {
    titleAr: input.titleAr,
    titleEn: input.titleEn,
    bodyAr: input.bodyAr,
    bodyEn: input.bodyEn,
  });
}
