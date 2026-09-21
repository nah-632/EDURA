/**
 * Account service: the customer's own profile, preferences, sessions and the
 * "delete my account" path (§7.1, §25).
 *
 * Everything here takes the user id from the verified session - never from a
 * request body - so there is no id to tamper with, and every read/write is
 * scoped by it in the WHERE clause.
 */
import { query, withTransaction, type TxClient } from "@/lib/db";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "@/lib/security/password";
import { writeAudit, writeAuditTx } from "@/lib/security/audit";
import { revokeOtherSessions } from "@/lib/auth/service";
import { sanitizePrefs, type NotificationPrefs } from "@/lib/notifications/catalog";
import type { Locale } from "@/lib/i18n";
import { ANONYMISED } from "./retention";

export interface AccountProfile {
  id: string;
  fullName: string;
  displayName: string | null;
  email: string;
  phone: string;
  locale: Locale;
  notificationPrefs: NotificationPrefs;
  avatarUrl: string | null;
  role: string;
  createdAt: Date;
}

export async function getAccountProfile(userId: string): Promise<AccountProfile | null> {
  const rows = await query<{
    id: string;
    full_name: string;
    display_name: string | null;
    email: string;
    phone: string;
    locale: string;
    notification_prefs: NotificationPrefs | null;
    avatar_url: string | null;
    primary_role: string;
    created_at: Date;
  }>(
    `select u.id, coalesce(p.full_name, u.email) as full_name, p.display_name, u.email, u.phone,
            u.locale, p.notification_prefs, p.avatar_url, u.primary_role, u.created_at
       from users u left join user_profiles p on p.user_id = u.id
      where u.id = $1 and u.deleted_at is null`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
    locale: row.locale === "en" ? "en" : "ar",
    notificationPrefs: row.notification_prefs ?? {},
    avatarUrl: row.avatar_url,
    role: row.primary_role,
    createdAt: row.created_at,
  };
}

export interface UpdateProfileInput {
  fullName?: string;
  displayName?: string | null;
  locale?: Locale;
  notificationPrefs?: unknown;
}

/**
 * Update the fields a customer owns. Email and phone are NOT editable here:
 * they are identity, and changing them needs a verification flow that does not
 * exist yet - so the UI does not offer it rather than pretending.
 */
export async function updateOwnProfile(userId: string, input: UpdateProfileInput): Promise<AccountProfile | null> {
  await withTransaction(async (tx: TxClient) => {
    const before = await tx.one<{
      full_name: string | null;
      display_name: string | null;
      preferred_locale: string | null;
      notification_prefs: NotificationPrefs | null;
    }>(
      `select p.full_name, p.display_name, p.preferred_locale, p.notification_prefs
         from user_profiles p where p.user_id = $1`,
      [userId],
    );

    if (input.fullName !== undefined || input.displayName !== undefined || input.locale !== undefined) {
      // Only the fields that were actually submitted are written. A blanket
      // `set display_name = $3` would erase a display name whenever the form
      // that only edits the full name was submitted.
      await tx.query(
        `insert into user_profiles (user_id, full_name, display_name, preferred_locale)
         values ($1, coalesce($2, 'مستخدم'), $3, coalesce($4, 'ar'))
         on conflict (user_id) do update
           set full_name = case when $5::boolean then $2 else user_profiles.full_name end,
               display_name = case when $6::boolean then $3 else user_profiles.display_name end,
               preferred_locale = case when $7::boolean then coalesce($4, user_profiles.preferred_locale)
                                       else user_profiles.preferred_locale end`,
        [
          userId,
          input.fullName ?? null,
          input.displayName ?? null,
          input.locale ?? null,
          input.fullName !== undefined,
          input.displayName !== undefined,
          input.locale !== undefined,
        ],
      );
    }
    if (input.notificationPrefs !== undefined) {
      // Sanitised so the JSONB column cannot become arbitrary storage.
      const prefs = sanitizePrefs(input.notificationPrefs);
      await tx.query(
        `insert into user_profiles (user_id, full_name, notification_prefs)
         values ($1, 'مستخدم', $2::jsonb)
         on conflict (user_id) do update set notification_prefs = $2::jsonb`,
        [userId, JSON.stringify(prefs)],
      );
    }
    if (input.locale !== undefined) {
      await tx.query(`update users set locale = $2 where id = $1`, [userId, input.locale]);
    }

    await writeAuditTx(tx, {
      actorUserId: userId,
      actorLabel: null,
      action: "account.profile_updated",
      entity: "user_profiles",
      entityId: userId,
      before,
      after: {
        full_name: input.fullName ?? before?.full_name,
        display_name: input.displayName ?? before?.display_name,
        preferred_locale: input.locale ?? before?.preferred_locale,
      },
    });
  });

  return getAccountProfile(userId);
}

export type PasswordChangeResult = "ok" | "wrong_password" | "policy";

/**
 * Change the password. Other sessions are revoked on success - changing a
 * password is what you do when you suspect the old one leaked, so leaving other
 * sessions alive would defeat the point.
 */
export async function changeOwnPassword(
  userId: string,
  sessionId: string,
  currentPassword: string,
  newPassword: string,
): Promise<PasswordChangeResult> {
  const row = await query<{ password_hash: string }>(
    `select password_hash from users where id = $1 and deleted_at is null`,
    [userId],
  );
  if (!row[0]) return "wrong_password";
  if (!(await verifyPassword(currentPassword, row[0].password_hash))) return "wrong_password";

  const policy = checkPasswordPolicy(newPassword);
  if (!policy.ok) return "policy";

  const hash = await hashPassword(newPassword);
  await query(`update users set password_hash = $2, failed_logins = 0, locked_until = null where id = $1`, [
    userId,
    hash,
  ]);
  const revoked = await revokeOtherSessions(userId, sessionId);
  await writeAudit({
    actorUserId: userId,
    actorLabel: null,
    action: "account.password_changed",
    entity: "users",
    entityId: userId,
    after: { other_sessions_revoked: revoked },
  });
  return "ok";
}

export async function revokeMyOtherSessions(userId: string, sessionId: string): Promise<number> {
  const revoked = await revokeOtherSessions(userId, sessionId);
  await writeAudit({
    actorUserId: userId,
    actorLabel: null,
    action: "account.sessions_revoked",
    entity: "sessions",
    entityId: sessionId,
    after: { revoked },
  });
  return revoked;
}

export interface DeletionOutcome {
  anonymised: true;
  retained: string[];
  removed: string[];
}

/**
 * "Delete my account" (§25).
 *
 * What happens, precisely:
 *  - the account is flagged deleted, sign-in is impossible, every session is
 *    revoked and every notification is removed;
 *  - the profile is anonymised (name, avatar, contact handles) so the person is
 *    no longer identifiable from their own row;
 *  - student records are anonymised as well - a minor's data must not survive a
 *    parent's deletion request;
 *  - booking rows STAY because they are the financial record, but the free-text
 *    notes and the home address are cleared, since those are the fields that
 *    could identify a family;
 *  - payments and their verification metadata stay untouched;
 *  - the whole thing runs in one transaction, and the audit entry records what
 *    was removed versus retained, so the policy is auditable rather than
 *    asserted.
 */
export async function deleteOwnAccount(userId: string, password: string): Promise<DeletionOutcome> {
  // Irreversible, so it is treated like a credential change: a hijacked session
  // must not be enough to destroy an account.
  const credential = await query<{ password_hash: string }>(
    `select password_hash from users where id = $1 and deleted_at is null`,
    [userId],
  );
  if (!credential[0] || !(await verifyPassword(password, credential[0].password_hash))) {
    throw new Error("wrong_password");
  }

  const anonymisedEmail = `${ANONYMISED.emailPrefix}${userId}@${ANONYMISED.emailDomain}`;

  const outcome = await withTransaction(async (tx: TxClient) => {
    const notesScrubbed = await tx.query<{ id: string }>(
      `update bookings
          set customer_notes = null, address_note = null
        where customer_user_id = $1 and (customer_notes is not null or address_note is not null)
        returning id`,
      [userId],
    );
    const students = await tx.query<{ id: string }>(
      `update students
          set full_name = $2, notes = null, grade = null, birth_year = null, gender = null,
              deleted_at = coalesce(deleted_at, now())
        where owner_user_id = $1 and deleted_at is null
        returning id`,
      [userId, ANONYMISED.studentName],
    );
    const notifications = await tx.query<{ id: string }>(
      `delete from notifications where user_id = $1 returning id`,
      [userId],
    );
    const sessions = await tx.query<{ id: string }>(
      `update sessions set revoked_at = now() where user_id = $1 and revoked_at is null returning id`,
      [userId],
    );
    await tx.query(
      `insert into user_profiles (user_id, full_name, display_name, avatar_url, notification_prefs)
       values ($1, $2, null, null, '{}'::jsonb)
       on conflict (user_id) do update
         set full_name = $2, display_name = null, avatar_url = null, notification_prefs = '{}'::jsonb`,
      [userId, ANONYMISED.fullName],
    );
    await tx.query(
      `update users
          set deleted_at = now(), status = 'deleted', email = $2, phone = $3,
              password_hash = 'deleted', mfa_secret = null, mfa_enabled = false
        where id = $1`,
      [userId, anonymisedEmail, `deleted-${userId.slice(0, 8)}`],
    );
    await writeAuditTx(tx, {
      actorUserId: userId,
      actorLabel: anonymisedEmail,
      action: "account.deleted",
      entity: "users",
      entityId: userId,
      after: {
        students_anonymised: students.length,
        notifications_deleted: notifications.length,
        sessions_revoked: sessions.length,
        booking_notes_scrubbed: notesScrubbed.length,
        retained: ["bookings", "payments", "audit_logs"],
      },
    });
    return {
      anonymised: true as const,
      removed: [
        `${students.length} student record(s)`,
        `${notifications.length} notification(s)`,
        `${sessions.length} session(s)`,
      ],
      retained: ["bookings (notes and address cleared)", "payments", "audit_logs"],
    };
  });

  return outcome;
}
