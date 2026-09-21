import { redirect } from "next/navigation";

import { AdminDenied } from "@/components/admin/AdminShell";
import { ActionForm } from "@/components/forms/ActionForm";
import { AdminHeading, StatusPill } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/guard";
import { providerStatuses } from "@/lib/providers";
import { createTranslator, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/admin/notifications (§17).
 *
 * The channel list is generated from the provider registry, so the console can
 * only ever show what is actually wired up. Email appears as "not configured"
 * because it genuinely is, and no screen claims a WhatsApp API message was sent
 * when the platform's only WhatsApp capability is opening a deep link.
 */
export default async function AdminNotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await adminGate("notification.send");
  if (!gate.ok) {
    if (gate.reason === "unauthenticated") redirect(`/${locale}/admin/login`);
    return <AdminDenied locale={locale} reason="forbidden" />;
  }

  const t = createTranslator(locale);
  const providers = providerStatuses();

  return (
    <div className="admin-section">
      <AdminHeading
        kicker={t("admin.title")}
        title={t("admin.notifications.title")}
        subtitle={t("admin.notifications.subtitle")}
      />

      <ActionForm
        locale={locale}
        endpoint="/api/admin/notifications"
        title={t("admin.notifications.compose")}
        help={t("admin.notifications.subtitle")}
        resetAfterSubmit
        fields={[
          {
            kind: "select",
            name: "audience",
            label: t("admin.notifications.audience"),
            value: "students",
            options: [
              { value: "all", label: t("admin.notifications.audience.all") },
              { value: "students", label: t("admin.notifications.audience.students") },
              { value: "tutors", label: t("admin.notifications.audience.tutors") },
            ],
          },
          { kind: "text", name: "audienceId", label: t("admin.notifications.audience.user"), help: t("label.optional"), dir: "ltr" },
          { kind: "text", name: "titleAr", label: `${t("admin.notifications.title_field")} (AR)`, required: true, maxLength: 120 },
          { kind: "text", name: "titleEn", label: `${t("admin.notifications.title_field")} (EN)`, required: true, maxLength: 120, dir: "ltr" },
          { kind: "textarea", name: "bodyAr", label: `${t("admin.notifications.body")} (AR)`, required: true, maxLength: 600 },
          { kind: "textarea", name: "bodyEn", label: `${t("admin.notifications.body")} (EN)`, required: true, maxLength: 600 },
        ]}
        submitLabel={t("admin.notifications.send")}
        successText={t("admin.notifications.sent")}
      />

      <div className="card stack-sm">
        <h2 style={{ fontSize: "1.05rem" }}>{t("admin.notifications.channels")}</h2>
        <ul className="admin-list">
          {providers.map((provider) => (
            <li key={provider.id}>
              <span className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
                <span translate="no">{provider.label}</span>
                <StatusPill tone={provider.configured ? "ok" : "warn"} label={provider.configured ? t("label.yes") : t("label.no")} />
              </span>
              <span className="field__hint">{provider.reason ?? t("reminder.note")}</span>
            </li>
          ))}
        </ul>
        <p className="notice notice--info">{t("reminder.note")}</p>
      </div>

      <div className="card stack-xs">
        <strong>{t("admin.notifications.channelInApp")}</strong>
        <p className="soft">{t("notifications.title")}</p>
        <p className="field__hint">{t("reminder.emailDisabled")}</p>
        <p className="field__hint">{t("reminder.whatsappDisabled")}</p>
      </div>
    </div>
  );
}
