import { redirect } from "next/navigation";

import { AdminDenied } from "@/components/admin/AdminShell";
import { ActionForm } from "@/components/forms/ActionForm";
import { AdminHeading } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/guard";
import { getGuaranteeConfig, getSettings } from "@/lib/settings";
import { dbConfigured } from "@/lib/db";
import { createTranslator, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/admin/settings (§41, addendum §C).
 *
 * One row of business configuration: identity, contact numbers, booking rules,
 * review moderation and the guarantee terms. Nothing here is a constant in the
 * codebase, which is why changing the cancellation window or the guarantee
 * claim window is an operational decision rather than a release.
 */
export default async function AdminSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await adminGate("settings.manage");
  if (!gate.ok) {
    if (gate.reason === "unauthenticated") redirect(`/${locale}/admin/login`);
    return <AdminDenied locale={locale} reason="forbidden" />;
  }

  const t = createTranslator(locale);
  const [settings, guarantee] = await Promise.all([getSettings(), getGuaranteeConfig()]);

  return (
    <div className="admin-section">
      <AdminHeading
        kicker={t("admin.title")}
        title={t("admin.settings.title")}
        subtitle={t("admin.settings.subtitle")}
      />

      {!dbConfigured() ? <p className="notice notice--warn">{t("error.notConfigured")}</p> : null}

      <ActionForm
        locale={locale}
        endpoint="/api/admin/settings"
        title={t("admin.settings.title")}
        fields={[
          { kind: "text", name: "platformNameAr", label: `${t("admin.settings.platformName")} (AR)`, value: settings.platformNameAr, required: true },
          { kind: "text", name: "platformNameEn", label: `${t("admin.settings.platformName")} (EN)`, value: settings.platformNameEn, required: true, dir: "ltr" },
          {
            kind: "text",
            name: "whatsappNumber",
            label: t("admin.settings.whatsappNumber"),
            value: settings.whatsappNumber,
            required: true,
            dir: "ltr",
            help: "+973XXXXXXXX",
          },
          { kind: "text", name: "benefitPayNumber", label: t("admin.settings.benefitPayNumber"), value: settings.benefitPayNumber, required: true, dir: "ltr" },
          { kind: "text", name: "supportEmail", label: t("admin.settings.supportEmail"), value: settings.supportEmail, required: true, dir: "ltr" },
          { kind: "text", name: "supportPhone", label: t("admin.settings.supportPhone"), value: settings.supportPhone, required: true, dir: "ltr" },
          { kind: "number", name: "cancellationHours", label: t("admin.settings.cancellationHours"), value: settings.cancellationHours, min: 0, max: 168 },
          { kind: "number", name: "minLeadTimeHours", label: t("admin.settings.minLeadTimeHours"), value: settings.minLeadTimeHours, min: 0, max: 720 },
          { kind: "number", name: "maxAdvanceDays", label: t("admin.settings.maxAdvanceDays"), value: settings.maxAdvanceDays, min: 1, max: 365 },
          {
            kind: "checkbox",
            name: "reviewModeration",
            label: t("admin.settings.reviewModeration"),
            value: settings.reviewModeration,
            help: t("admin.reviews.affectsRating"),
          },
          {
            kind: "checkbox",
            name: "allowTutorDecline",
            label: t("admin.settings.allowTutorCancelBooking"),
            value: settings.allowTutorDecline,
          },
          {
            kind: "checkbox",
            name: "guaranteeEnabled",
            label: t("guarantee.satisfaction.title"),
            value: guarantee.satisfactionEnabled,
            help: t("guarantee.reviewNote"),
          },
          {
            kind: "number",
            name: "guaranteeClaimWindowHours",
            label: t("guarantee.badge.replacement", { hours: guarantee.claimWindowHours }),
            value: guarantee.claimWindowHours,
            min: 1,
            max: 720,
          },
          {
            kind: "number",
            name: "guaranteeMaxCompletedSessions",
            label: t("guarantee.satisfaction.title"),
            value: guarantee.maxCompletedSessions,
            min: 0,
            max: 10,
            help: t("tutor.dashboard.stats.completed"),
          },
          {
            kind: "number",
            name: "guaranteeReplacementSessions",
            label: t("admin.plans.durationDays"),
            value: guarantee.replacementSessions,
            min: 1,
            max: 5,
          },
        ]}
        submitLabel={t("cta.save")}
        successText={t("admin.settings.saved")}
      />

      <div className="card stack-xs">
        <strong>{t("admin.settings.bookingRules")}</strong>
        <p className="soft">{t("admin.settings.paymentInstructions")}</p>
        <p className="field__hint">{t("payment.manualNotice")}</p>
        <p className="field__hint">{t("admin.settings.currencyNote")}</p>
      </div>
    </div>
  );
}
