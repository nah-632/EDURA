import { redirect } from "next/navigation";

import { AdminDenied } from "@/components/admin/AdminShell";
import { ActionButton } from "@/components/forms/ActionButton";
import { ActionForm } from "@/components/forms/ActionForm";
import { AdminHeading, DataState, StatusPill, TableScroll } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/guard";
import { getAdminCatalog, type CatalogItem } from "@/lib/admin/queries";
import { createTranslator, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/admin/catalog (§28, §41).
 *
 * Subjects, stages and areas are reference data, never constants. Removal is a
 * deactivation: historic bookings and tutor profiles point at these rows, so a
 * delete would either break those rows or silently rewrite history.
 */
export default async function AdminCatalogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await adminGate("catalog.manage");
  if (!gate.ok) {
    if (gate.reason === "unauthenticated") redirect(`/${locale}/admin/login`);
    return <AdminDenied locale={locale} reason="forbidden" />;
  }

  const t = createTranslator(locale);
  const { dbReady, data } = await getAdminCatalog();

  const groups: { kind: "subjects" | "stages" | "areas"; title: string; items: CatalogItem[] }[] = [
    { kind: "subjects", title: t("admin.catalog.subjects"), items: data.subjects },
    { kind: "stages", title: t("admin.catalog.stages"), items: data.stages },
    { kind: "areas", title: t("admin.catalog.areas"), items: data.areas },
  ];

  return (
    <div className="admin-section">
      <AdminHeading kicker={t("admin.title")} title={t("admin.catalog.title")} subtitle={t("admin.catalog.subtitle")} />

      <ActionForm
        locale={locale}
        endpoint="/api/admin/catalog"
        title={t("admin.catalog.add")}
        extra={{ action: "upsert" }}
        resetAfterSubmit
        fields={[
          {
            kind: "select",
            name: "kind",
            label: t("admin.catalog.title"),
            value: "subjects",
            options: [
              { value: "subjects", label: t("admin.catalog.subjects") },
              { value: "stages", label: t("admin.catalog.stages") },
              { value: "areas", label: t("admin.catalog.areas") },
            ],
          },
          { kind: "text", name: "code", label: t("admin.catalog.code"), required: true, dir: "ltr", maxLength: 40, help: "a-z0-9_" },
          { kind: "text", name: "nameAr", label: t("admin.catalog.nameAr"), required: true, maxLength: 80 },
          { kind: "text", name: "nameEn", label: t("admin.catalog.nameEn"), required: true, maxLength: 80, dir: "ltr" },
          { kind: "number", name: "sortOrder", label: t("admin.catalog.sort"), value: 0, min: 0, max: 999 },
          { kind: "checkbox", name: "isActive", label: t("admin.catalog.activate"), value: true },
        ]}
        submitLabel={t("admin.catalog.add")}
        successText={t("admin.catalog.saved")}
      />

      <p className="field__hint">{t("admin.catalog.deleteBlocked")}</p>

      {groups.map((group) => (
        <div className="admin-section" key={group.kind}>
          <h2 style={{ fontSize: "1.05rem" }}>{group.title}</h2>
          <DataState locale={locale} dbReady={dbReady} isEmpty={group.items.length === 0} emptyTitle="state.emptyTitle">
            <TableScroll>
              <thead>
                <tr>
                  <th>{t("admin.catalog.code")}</th>
                  <th>{t("admin.catalog.nameAr")}</th>
                  <th>{t("admin.catalog.nameEn")}</th>
                  <th>{t("admin.catalog.sort")}</th>
                  <th>{t("label.status")}</th>
                  <th>{t("admin.actions.action")}</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => (
                  <tr key={item.id}>
                    <td translate="no" className="tnum">{item.code}</td>
                    <td>{item.nameAr}</td>
                    <td translate="no">{item.nameEn}</td>
                    <td className="tnum">{item.sortOrder}</td>
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
                          payload={{ action: item.isActive ? "deactivate" : "activate", kind: group.kind, id: item.id }}
                          label={item.isActive ? t("admin.catalog.deactivate") : t("admin.catalog.activate")}
                          variant={item.isActive ? "danger" : "primary"}
                          disabledReason={`${t("admin.catalog.deleteBlocked")} (${item.usageCount})`}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          </DataState>
        </div>
      ))}
    </div>
  );
}
