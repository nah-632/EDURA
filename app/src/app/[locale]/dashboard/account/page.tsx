import Link from "next/link";

import { DeleteAccountForm } from "@/components/account/DeleteAccountForm";
import { ActionButton } from "@/components/forms/ActionButton";
import { ActionForm } from "@/components/forms/ActionForm";
import { requirePageSession } from "@/lib/auth/server";
import { getAccountProfile } from "@/lib/account/service";
import { deletionPlan } from "@/lib/account/retention";
import { preferenceBuckets } from "@/lib/notifications/catalog";
import { dbConfigured } from "@/lib/db";
import { createTranslator, resolveLocale, type DictKey } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const PREF_LABEL: Record<string, DictKey> = {
  booking_updates: "account.notify.booking_updates",
  payment_updates: "account.notify.payment_updates",
  lesson_reminders: "account.notify.lesson_reminders",
  review_requests: "account.notify.review_requests",
  platform_announcements: "account.notify.platform_announcements",
};

/**
 * /[locale]/dashboard/account (§7.1, §25).
 *
 * What the customer can change about themselves, what they cannot (email and
 * phone are verified identity - the screen does not offer fields that would not
 * be honoured), and the deletion path with its retention consequences spelled
 * out before it runs.
 */
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await requirePageSession();
  const t = createTranslator(locale);
  const profile = gate.ok && dbConfigured() ? await getAccountProfile(gate.session.user.id).catch(() => null) : null;
  const plan = deletionPlan();

  return (
    <div className="admin-section">
      <div className="stack-xs">
        <h1 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
          {t("account.title")}
        </h1>
        <p className="field__hint">{t("account.sessionsBody")}</p>
      </div>

      {!profile ? (
        <div className="card stack-xs">
          <strong>{t("error.notConfigured")}</strong>
          <p className="soft">{t("state.unavailable")}</p>
        </div>
      ) : (
        <div className="admin-split">
          <div className="admin-section">
            <ActionForm
              locale={locale}
              endpoint="/api/me"
              title={t("account.profileTitle")}
              extra={{ action: "update_profile" }}
              fields={[
                { kind: "text", name: "fullName", label: t("auth.fullName"), value: profile.fullName, required: true, maxLength: 120 },
                { kind: "text", name: "displayName", label: t("account.displayName"), value: profile.displayName, maxLength: 80 },
                {
                  kind: "select",
                  name: "locale",
                  label: t("account.preferredLocale"),
                  value: profile.locale,
                  options: [
                    { value: "ar", label: "العربية" },
                    { value: "en", label: "English" },
                  ],
                },
              ]}
              submitLabel={t("cta.save")}
              successText={t("account.saved")}
            />

            <div className="card stack-xs">
              <strong>{t("auth.email")}</strong>
              <p className="soft" translate="no">
                {profile.email}
              </p>
              <p className="field__hint">{t("auth.guestBrowsing")}</p>
              <p className="field__hint" translate="no">
                {profile.phone}
              </p>
            </div>

            <ActionForm
              locale={locale}
              endpoint="/api/me"
              title={t("account.notificationPrefs")}
              variant="outline"
              extra={{ action: "update_profile" }}
              fields={preferenceBuckets.map((bucket) => ({
                kind: "checkbox" as const,
                name: `notificationPrefs.${bucket}`,
                label: t(PREF_LABEL[bucket] ?? "notifications.title"),
                value: profile.notificationPrefs[bucket] !== false,
              }))}
              submitLabel={t("cta.save")}
              successText={t("account.saved")}
            />

            <ActionForm
              locale={locale}
              endpoint="/api/me"
              title={t("account.changePassword")}
              variant="outline"
              resetAfterSubmit
              extra={{ action: "change_password" }}
              fields={[
                { kind: "password", name: "currentPassword", label: t("account.currentPassword"), required: true, autoComplete: "current-password", dir: "ltr" },
                { kind: "password", name: "newPassword", label: t("account.newPassword"), required: true, autoComplete: "new-password", dir: "ltr" },
              ]}
              submitLabel={t("cta.save")}
              successText={t("account.passwordChanged")}
            />
          </div>

          <div className="admin-section">
            <div className="card stack-sm">
              <h2 style={{ fontSize: "1.05rem" }}>{t("account.sessions")}</h2>
              <p className="soft">{t("account.sessionsBody")}</p>
              <ActionButton
                locale={locale}
                endpoint="/api/me"
                payload={{ action: "revoke_other_sessions" }}
                label={t("account.revokeOthers")}
                successText={t("account.revoked")}
              />
            </div>

            <div className="card stack-sm">
              <h2 style={{ fontSize: "1.05rem" }}>{t("privacy.retentionTitle")}</h2>
              <p className="soft">{t("legal.privacy.s6.body")}</p>
              <ul className="admin-list">
                {plan.retained.map((entry) => (
                  <li key={entry.table}>
                    <span translate="no">{entry.table}</span>
                    <span className="field__hint">{entry.reason}</span>
                  </li>
                ))}
              </ul>
              <Link className="btn btn--quiet btn--sm" href={`/${locale}/legal/privacy`}>
                {t("legal.privacy.title")}
              </Link>
            </div>

            <DeleteAccountForm
              locale={locale}
              confirmWord={t("privacy.deleteConfirmWord")}
              removed={plan.removed}
              retained={plan.retained.map((entry) => `${entry.table} — ${entry.reason}`)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
