import { redirect } from "next/navigation";

import { AdminDenied } from "@/components/admin/AdminShell";
import { ActionForm } from "@/components/forms/ActionForm";
import { AdminHeading } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/guard";
import { readCmsContent } from "@/lib/cms/public";
import { createTranslator, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/admin/cms (§15, addendum §A/§B/§C).
 *
 * Content editing is separate from platform settings on purpose: the About and
 * Guarantee copy can be rewritten by whoever runs communications without any
 * risk of touching a booking rule. Leaving a field empty removes the override,
 * and the reviewed default from the dictionary is rendered instead - so a
 * half-finished edit can never produce a blank page.
 */
export default async function AdminCmsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await adminGate("cms.manage");
  if (!gate.ok) {
    if (gate.reason === "unauthenticated") redirect(`/${locale}/admin/login`);
    return <AdminDenied locale={locale} reason="forbidden" />;
  }

  const t = createTranslator(locale);
  const cms = await readCmsContent();

  return (
    <div className="admin-section">
      <AdminHeading kicker={t("admin.title")} title={t("admin.cms.title")} subtitle={t("admin.cms.subtitle")} />

      <ActionForm
        locale={locale}
        endpoint="/api/admin/cms"
        title={t("home.hero.title")}
        fields={[
          { kind: "text", name: "heroTitleAr", label: `${t("home.hero.title")} (AR)`, value: cms.heroTitleAr, maxLength: 160 },
          { kind: "text", name: "heroTitleEn", label: `${t("home.hero.title")} (EN)`, value: cms.heroTitleEn, maxLength: 160, dir: "ltr" },
          // Promo banner: the text AND the switch. It is the operator's
          // announcement surface — a launch offer, a holiday schedule — and it
          // must not need a deploy to change.
          { kind: "textarea", name: "promoBannerAr", label: `${t("admin.cms.promoBanner")} (AR)`, value: cms.promoBannerAr, rows: 2, maxLength: 300 },
          { kind: "textarea", name: "promoBannerEn", label: `${t("admin.cms.promoBanner")} (EN)`, value: cms.promoBannerEn, rows: 2, maxLength: 300, dir: "ltr" },
          { kind: "checkbox", name: "promoActive", label: t("admin.cms.promoActive"), value: Boolean(cms.promoActive) },
          // The hero fields below are grouped with the banner because they are
          // both "what the homepage says first".
          { kind: "textarea", name: "heroLeadAr", label: `${t("home.hero.lead")} (AR)`, value: cms.heroLeadAr, rows: 2 },
          { kind: "textarea", name: "heroLeadEn", label: `${t("home.hero.lead")} (EN)`, value: cms.heroLeadEn, rows: 2 },
        ]}
        submitLabel={t("cta.save")}
        successText={t("admin.cms.saved")}
      />

      <ActionForm
        locale={locale}
        endpoint="/api/admin/cms"
        title={t("admin.cms.section")}
        extra={{}}
        variant="outline"
        fields={[
          { kind: "textarea", name: "aboutIntroAr", label: `${t("about.intro")} (AR)`, value: cms.aboutIntroAr, rows: 3, maxLength: 1200 },
          { kind: "textarea", name: "aboutIntroEn", label: `${t("about.intro")} (EN)`, value: cms.aboutIntroEn, rows: 3, maxLength: 1200 },
          { kind: "textarea", name: "aboutFamiliesAr", label: `${t("about.families.lead")} (AR)`, value: cms.aboutFamiliesAr, rows: 2, maxLength: 800 },
          { kind: "textarea", name: "aboutFamiliesEn", label: `${t("about.families.lead")} (EN)`, value: cms.aboutFamiliesEn, rows: 2, maxLength: 800 },
          { kind: "textarea", name: "aboutTutorsAr", label: `${t("about.tutors.lead")} (AR)`, value: cms.aboutTutorsAr, rows: 2, maxLength: 800 },
          { kind: "textarea", name: "aboutTutorsEn", label: `${t("about.tutors.lead")} (EN)`, value: cms.aboutTutorsEn, rows: 2, maxLength: 800 },
          { kind: "textarea", name: "aboutClosingAr", label: `${t("about.closing")} (AR)`, value: cms.aboutClosingAr, rows: 3, maxLength: 1200 },
          { kind: "textarea", name: "aboutClosingEn", label: `${t("about.closing")} (EN)`, value: cms.aboutClosingEn, rows: 3, maxLength: 1200 },
          { kind: "textarea", name: "guaranteeIntroAr", label: `${t("guarantee.intro")} (AR)`, value: cms.guaranteeIntroAr, rows: 2, maxLength: 1200 },
          { kind: "textarea", name: "guaranteeIntroEn", label: `${t("guarantee.intro")} (EN)`, value: cms.guaranteeIntroEn, rows: 2, maxLength: 1200 },
          {
            kind: "textarea",
            name: "guaranteeSatisfactionAr",
            label: `${t("guarantee.satisfaction.title")} (AR)`,
            value: cms.guaranteeSatisfactionAr,
            rows: 3,
            maxLength: 1200,
            help: t("guarantee.reviewNote"),
          },
          {
            kind: "textarea",
            name: "guaranteeSatisfactionEn",
            label: `${t("guarantee.satisfaction.title")} (EN)`,
            value: cms.guaranteeSatisfactionEn,
            rows: 3,
            maxLength: 1200,
          },
        ]}
        submitLabel={t("cta.save")}
        successText={t("admin.cms.saved")}
      />

      <div className="card stack-xs">
        <strong>{t("admin.cms.languageNote")}</strong>
        <p className="soft">{t("admin.cms.subtitle")}</p>
        <p className="field__hint">{t("admin.cms.promoActive")}</p>
        <p className="field__hint">{t("guarantee.reviewNote")}</p>
      </div>
    </div>
  );
}
