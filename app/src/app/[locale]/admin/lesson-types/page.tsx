import { redirect } from "next/navigation";

import { AdminDenied } from "@/components/admin/AdminShell";
import { ActionButton } from "@/components/forms/ActionButton";
import { ActionForm } from "@/components/forms/ActionForm";
import { AdminHeading, DataState, Money, StatusPill, TableScroll } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/guard";
import { getAdminCatalog } from "@/lib/admin/queries";
import { createTranslator, formatDuration, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/admin/lesson-types (§10).
 *
 * Lesson types carry the price multiplier and default duration the booking
 * engine reads, which is why they are configuration rather than a list in code:
 * changing "Intensive course" from 1.5× to 2× must not require a deployment.
 * Those numeric columns only exist for lesson types, so the editor is a separate
 * screen from the plain catalogue.
 */
export default async function AdminLessonTypesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await adminGate("catalog.manage");
  if (!gate.ok) {
    if (gate.reason === "unauthenticated") redirect(`/${locale}/admin/login`);
    return <AdminDenied locale={locale} reason="forbidden" />;
  }

  const t = createTranslator(locale);
  const { dbReady, data } = await getAdminCatalog();

  return (
    <div className="admin-section">
      <AdminHeading
        kicker={t("admin.title")}
        title={t("admin.nav.lessonTypes")}
        subtitle={t("admin.catalog.subtitle")}
      />

      <ActionForm
        locale={locale}
        endpoint="/api/admin/catalog"
        title={t("admin.catalog.add")}
        extra={{ action: "upsert", kind: "lessonTypes" }}
        resetAfterSubmit
        fields={[
          { kind: "text", name: "code", label: t("admin.catalog.code"), required: true, dir: "ltr", maxLength: 40 },
          { kind: "text", name: "nameAr", label: t("admin.catalog.nameAr"), required: true, maxLength: 80 },
          { kind: "text", name: "nameEn", label: t("admin.catalog.nameEn"), required: true, maxLength: 80, dir: "ltr" },
          {
            kind: "number",
            name: "defaultDuration",
            label: t("admin.catalog.defaultDuration"),
            value: 60,
            min: 30,
            max: 240,
            step: 15,
            help: t("label.minutes"),
          },
          {
            kind: "number",
            name: "priceMultiplier",
            label: t("admin.catalog.priceMultiplier"),
            value: 1,
            min: 0.5,
            max: 5,
            step: 0.05,
            help: t("misc.vatIncluded"),
          },
          { kind: "number", name: "maxStudents", label: t("admin.catalog.maxStudents"), value: 1, min: 1, max: 20 },
          { kind: "number", name: "sortOrder", label: t("admin.catalog.sort"), value: 0, min: 0, max: 999 },
          { kind: "checkbox", name: "isActive", label: t("admin.catalog.activate"), value: true },
        ]}
        submitLabel={t("admin.catalog.add")}
        successText={t("admin.catalog.saved")}
      />

      <DataState locale={locale} dbReady={dbReady} isEmpty={data.lessonTypes.length === 0} emptyTitle="state.emptyTitle">
        <TableScroll>
          <thead>
            <tr>
              <th>{t("admin.catalog.code")}</th>
              <th>{t("admin.catalog.nameAr")}</th>
              <th>{t("admin.catalog.defaultDuration")}</th>
              <th>{t("admin.catalog.priceMultiplier")}</th>
              <th>{t("admin.catalog.maxStudents")}</th>
              <th>{t("label.status")}</th>
              <th>{t("admin.actions.action")}</th>
            </tr>
          </thead>
          <tbody>
            {data.lessonTypes.map((item) => (
              <tr key={item.id}>
                <td translate="no" className="tnum">{item.code}</td>
                <td>
                  {item.nameAr}
                  <div className="field__hint" translate="no">
                    {item.nameEn}
                  </div>
                </td>
                <td className="tnum">
                  {typeof item.extra?.defaultDuration === "number"
                    ? formatDuration(item.extra.defaultDuration, locale)
                    : "—"}
                </td>
                <td className="tnum">{item.extra?.priceMultiplier ?? "—"}</td>
                <td className="tnum">{item.extra?.maxStudents ?? "—"}</td>
                <td>
                  <StatusPill
                    tone={item.isActive ? "ok" : "warn"}
                    label={item.isActive ? t("admin.catalog.activate") : t("admin.catalog.deactivate")}
                  />
                </td>
                <td>
                  <div className="admin-actions">
                    <ActionButton
                      locale={locale}
                      endpoint="/api/admin/catalog"
                      payload={{ action: item.isActive ? "deactivate" : "activate", kind: "lessonTypes", id: item.id }}
                      label={item.isActive ? t("admin.catalog.deactivate") : t("admin.catalog.activate")}
                      variant={item.isActive ? "danger" : "primary"}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      </DataState>

      <div className="card stack-xs">
        <strong>{t("admin.catalog.priceMultiplier")}</strong>
        <p className="soft">{t("booking.price.calculated")}</p>
        <span className="tnum">
          <Money value="1.000" locale={locale} />
        </span>
      </div>
    </div>
  );
}
