/**
 * Notification catalogue (§17).
 *
 * A notification is described by a STABLE TYPE plus the parameters it needs to
 * be rendered ("booking.new_request" + {code}). Nothing user-visible is stored
 * in the row: the copy is rendered at read time, in the reader's own locale, so
 * a notification created while the platform was Arabic-only is still correct
 * for an English reader months later, and changing the wording never requires
 * a data migration.
 *
 * Each type also declares which preference bucket it belongs to, so the
 * "notification preferences" screen can be driven from this single table
 * instead of a second hand-maintained list.
 */

export const notificationTypes = [
  "booking.new_request",
  "booking.created",
  "booking.confirmed",
  "booking.cancelled",
  "booking.rejected",
  "booking.tutor_accepted",
  "booking.scheduled",
  "booking.completed",
  "payment.submitted",
  "payment.verified",
  "payment.rejected",
  "payment.refunded",
  "tutor.approved",
  "tutor.rejected",
  "tutor.suspended",
  "tutor.documents_rejected",
  "subscription.expiring",
  "subscription.expired",
  "subscription.activated",
  "reminder.lesson_24h",
  "reminder.lesson_2h",
  "review.requested",
  "review.published",
  "announcement",
] as const;

export type NotificationType = (typeof notificationTypes)[number];

/** Buckets shown on the account preferences screen. */
export const preferenceBuckets = [
  "booking_updates",
  "payment_updates",
  "lesson_reminders",
  "review_requests",
  "platform_announcements",
] as const;

export type PreferenceBucket = (typeof preferenceBuckets)[number];

export type NotificationPrefs = Partial<Record<PreferenceBucket, boolean>>;

interface TypeDefinition {
  bucket: PreferenceBucket;
  /** entity the notification points at, used for deep links */
  entityType: "booking" | "payment" | "tutor" | "subscription" | "review" | "platform";
  /** true when the notification is delivered by the scheduled reminder job */
  scheduled?: boolean;
}

const DEFINITIONS: Record<NotificationType, TypeDefinition> = {
  "booking.new_request": { bucket: "booking_updates", entityType: "booking" },
  "booking.created": { bucket: "booking_updates", entityType: "booking" },
  "booking.confirmed": { bucket: "booking_updates", entityType: "booking" },
  "booking.cancelled": { bucket: "booking_updates", entityType: "booking" },
  "booking.rejected": { bucket: "booking_updates", entityType: "booking" },
  "booking.tutor_accepted": { bucket: "booking_updates", entityType: "booking" },
  "booking.scheduled": { bucket: "booking_updates", entityType: "booking" },
  "booking.completed": { bucket: "booking_updates", entityType: "booking" },
  "payment.submitted": { bucket: "payment_updates", entityType: "payment" },
  "payment.verified": { bucket: "payment_updates", entityType: "payment" },
  "payment.rejected": { bucket: "payment_updates", entityType: "payment" },
  "payment.refunded": { bucket: "payment_updates", entityType: "payment" },
  "tutor.approved": { bucket: "booking_updates", entityType: "tutor" },
  "tutor.rejected": { bucket: "booking_updates", entityType: "tutor" },
  "tutor.suspended": { bucket: "booking_updates", entityType: "tutor" },
  "tutor.documents_rejected": { bucket: "booking_updates", entityType: "tutor" },
  "subscription.expiring": { bucket: "platform_announcements", entityType: "subscription" },
  "subscription.expired": { bucket: "platform_announcements", entityType: "subscription" },
  "subscription.activated": { bucket: "platform_announcements", entityType: "subscription" },
  "reminder.lesson_24h": { bucket: "lesson_reminders", entityType: "booking", scheduled: true },
  "reminder.lesson_2h": { bucket: "lesson_reminders", entityType: "booking", scheduled: true },
  "review.requested": { bucket: "review_requests", entityType: "booking", scheduled: true },
  "review.published": { bucket: "review_requests", entityType: "review" },
  announcement: { bucket: "platform_announcements", entityType: "platform" },
};

export function isNotificationType(value: string): value is NotificationType {
  return Object.prototype.hasOwnProperty.call(DEFINITIONS, value);
}

export function definitionFor(type: string): TypeDefinition {
  return isNotificationType(type)
    ? DEFINITIONS[type]
    : { bucket: "platform_announcements", entityType: "platform" };
}

export function bucketFor(type: string): PreferenceBucket {
  return definitionFor(type).bucket;
}

/**
 * Preferences default to ENABLED: a missing key means "not decided yet", and
 * defaulting to off would silently drop booking confirmations for every user
 * who never opened the preferences screen.
 */
export function isEnabled(prefs: NotificationPrefs | null | undefined, type: string): boolean {
  if (!prefs) return true;
  return prefs[bucketFor(type)] !== false;
}

/** Preferences are written from a form, so unknown keys are dropped, not stored. */
export function sanitizePrefs(input: unknown): NotificationPrefs {
  const out: NotificationPrefs = {};
  if (!input || typeof input !== "object") return out;
  for (const bucket of preferenceBuckets) {
    const value = (input as Record<string, unknown>)[bucket];
    if (typeof value === "boolean") out[bucket] = value;
  }
  return out;
}

/** Audience selectors accepted by the admin compose form (§15, §17). */
export const audiences = ["all", "students", "tutors", "user", "tutor"] as const;
export type Audience = (typeof audiences)[number];

/**
 * Audience -> SQL predicate over `users`.
 *
 * Banned/suspended/deleted accounts are excluded in every branch: a composed
 * announcement must never resurrect a suspended account's inbox, and the count
 * shown to the admin is produced by the same predicate that selects the
 * recipients (so the number cannot disagree with what was sent).
 */
const AUDIENCE_PREDICATES: Record<Audience, string> = {
  all: "u.deleted_at is null and u.status = 'active'",
  students: "u.deleted_at is null and u.status = 'active' and u.primary_role in ('student', 'parent')",
  tutors:
    "u.deleted_at is null and u.status = 'active' and exists (select 1 from tutors t where t.user_id = u.id and t.deleted_at is null)",
  // Targeting one member is still moderated: a suspended account must not be
  // resurrected by an admin announcement.
  user: "u.deleted_at is null and u.status = 'active' and u.id = $1",
  tutor:
    "u.deleted_at is null and exists (select 1 from tutors t where t.user_id = u.id and t.id = $1 and t.deleted_at is null)",
};

/** Audiences whose predicate takes the targeted id as $1. */
export function audienceTakesId(audience: Audience): boolean {
  return audience === "user" || audience === "tutor";
}

export function audiencePredicate(audience: Audience, targetId?: string | null): { where: string; params: unknown[] } {
  const where = AUDIENCE_PREDICATES[audience] ?? AUDIENCE_PREDICATES.all;
  const params = audienceTakesId(audience) ? [targetId ?? null] : [];
  return { where, params };
}

/** Deep link for a notification, resolved from its type (never stored). */
export function notificationHref(
  locale: string,
  type: string,
  entityId: string | null,
  isAdmin = false,
): string | null {
  if (!entityId) return null;
  const def = definitionFor(type);
  if (isAdmin) {
    switch (def.entityType) {
      case "booking":
        return `/${locale}/admin/bookings/${entityId}`;
      case "payment":
        return `/${locale}/admin/payments`;
      case "tutor":
        return `/${locale}/admin/tutors/${entityId}`;
      default:
        return null;
    }
  }
  switch (def.entityType) {
    case "booking":
      return `/${locale}/dashboard/bookings/${entityId}`;
    case "review":
      return `/${locale}/dashboard/bookings/${entityId}`;
    case "subscription":
      return `/${locale}/tutor/subscription`;
    case "tutor":
      return `/${locale}/tutor`;
    default:
      return null;
  }
}

export { DEFINITIONS as notificationDefinitions };
