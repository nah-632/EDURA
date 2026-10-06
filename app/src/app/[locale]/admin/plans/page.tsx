import { redirect } from "next/navigation";

import { AdminDenied } from "@/components/admin/AdminShell";
import { ActionButton } from "@/components/forms/ActionButton";
import { ActionForm } from "@/components/forms/ActionForm";
import { AdminHeading, DataState, Money, StatusPill, TableScroll } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/guard";
import { listPlansAdmin } from "@/lib/admin/queries";
import { createTranslator, formatMoney, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/admin/plans (§3, §37, §41).
 *
 * Subscription pricing lives in the database because it is a business decision.
 * Editing a plan here changes the pricing page and the tutor's renewal screen
 * together - both read this table - and the subscriber count is shown next to
 * each plan so nobody changes the terms of a plan 40 tutors are on without
 * noticing.
 */
export default async function AdminPlansPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await adminGate("plan.manage");
  if (!gate.ok) {
    if (gate.reason === "unauthenticated") redirect(`/${locale}/admin/login`);
    return <AdminDenied locale={locale} reason="forbidden" />;
  }

  const t = createTranslator(locale);
  const { dbReady, data: plans } = await listPlansAdmin();

  return (
    <div className="admin-section">
      <AdminHeading kicker={t("admin.title")} title={t("admin.plans.title")} subtitle={t("admin.plans.subtitle")} />

      <ActionForm
        locale={locale}
        endpoint="/api/admin/plans"
        title={t("admin.plans.title")}
        extra={{ action: "upsert" }}
        resetAfterSubmit
        fields={[
          { kind: "text", name: "code", label: t("admin.catalog.code"), required: true, dir: "ltr", maxLength: 40 },
          { kind: "text", name: "nameAr", label: t("admin.catalog.nameAr"), required: true, maxLength: 80 },
          { kind: "text", name: "nameEn", label: t("admin.catalog.nameEn"), required: true, maxLength: 80, dir: "ltr" },
          { kind: "number", name: "price", label: t("admin.plans.price"), required: true, min: 0, max: 10000, step: 0.5 },
          {
            kind: "select",
            name: "interval",
            label: t("admin.plans.interval"),
            value: "monthly",
            options: [
              { value: "monthly", label: t("admin.plans.interval.monthly") },
              { value: "annual", label: t("admin.plans.interval.annual") },
              { value: "one_time", label: t("admin.plans.interval.one_time") },
            ],
          },
          { kind: "number", name: "durationDays", label: t("admin.plans.durationDays"), required: true, min: 1, max: 36500 },
          { kind: "number", name: "graceDays", label: t("admin.plans.graceDays"), value: 3, min: 0, max: 90 },
          { kind: "number", name: "sortOrder", label: t("admin.catalog.sort"), value: 0, min: 0, max: 999 },
          { kind: "checkbox", name: "isActive", label: t("admin.plans.active"), value: true },
        ]}
        submitLabel={t("cta.save")}
        successText={t("admin.catalog.saved")}
      />

      <DataState locale={locale} dbReady={dbReady} isEmpty={plans.length === 0} emptyTitle="state.emptyTitle">
        <TableScroll>
          <thead>
            <tr>
              <th>{t("admin.catalog.code")}</th>
              <th>{t("admin.catalog.nameAr")}</th>
              <th>{t("admin.plans.price")}</th>
              <th>{t("admin.plans.interval")}</th>
              <th>{t("admin.plans.durationDays")}</th>
              <th>{t("admin.plans.graceDays")}</th>
              <th>{t("admin.plans.active")}</th>
              <th>{t("admin.overview.activeTutors")}</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td translate="no" className="tnum">{plan.code}</td>
                <td>
                  {plan.nameAr}
                  <div className="field__hint" translate="no">
                    {plan.nameEn}
                  </div>
                </td>
                <td>
                  <Money value={plan.price} locale={locale} />
                </td>
                <td>
                  {plan.interval === "monthly"
                    ? t("admin.plans.interval.monthly")
                    : plan.interval === "one_time"
                      ? t("admin.plans.interval.one_time")
                      : t("admin.plans.interval.annual")}
                </td>
                <td className="tnum">{plan.durationDays}</td>
                <td className="tnum">{plan.graceDays}</td>
                <td>
                  <StatusPill tone={plan.isActive ? "ok" : "warn"} label={plan.isActive ? t("label.yes") : t("label.no")} />
                </td>
                <td className="tnum">{plan.subscriberCount}</td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      </DataState>

      <div className="card stack-xs">
        <strong>{t("pricing.faq.q2")}</strong>
        <p className="soft">{t("pricing.faq.a2")}</p>
        <p className="field__hint">{t("admin.plans.activateSubscription")}</p>
        {plans[0] ? <span className="field__hint">{formatMoney(plans[0].price, locale)}</span> : null}
      </div>
    </div>
  );
}
