import { redirect } from "next/navigation";

import { AdminDenied } from "@/components/admin/AdminShell";
import { AdminHeading, DataState, FilterLinks, TableScroll } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/guard";
import { listAudit } from "@/lib/admin/queries";
import { createTranslator, formatDateTime, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/admin/audit (§38).
 *
 * The audit trail is append-only in the database (a trigger rejects UPDATE and
 * DELETE), so this screen is a reader with no edit affordance - which is the
 * point. Filters are URL-driven, and the before/after payload is shown as raw
 * JSON because an operator investigating a change needs the data, not a
 * prettified summary that hides the field they are looking for.
 */
export default async function AdminAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ action?: string; entity?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await adminGate("audit.read");
  if (!gate.ok) {
    if (gate.reason === "unauthenticated") redirect(`/${locale}/admin/login`);
    return <AdminDenied locale={locale} reason="forbidden" />;
  }

  const query = await searchParams;
  const action = query.action?.trim() ?? "";
  const entity = query.entity?.trim() ?? "";
  const t = createTranslator(locale);

  let dbReady = true;
  let entries: Awaited<ReturnType<typeof listAudit>> = [];
  try {
    entries = await listAudit(150, { action: action || undefined, entity: entity || undefined });
  } catch {
    dbReady = false;
  }

  const filters = [
    { value: "", label: t("label.all") },
    { value: "tutor.", label: "tutor." },
    { value: "booking.", label: "booking." },
    { value: "payment.", label: "payment." },
    { value: "user.", label: "user." },
    { value: "settings.", label: "settings." },
    { value: "cms.", label: "cms." },
    { value: "subscription.", label: "subscription." },
  ];

  return (
    <div className="admin-section">
      <AdminHeading
        kicker={t("admin.title")}
        title={t("admin.audit.title")}
        subtitle={t("admin.audit.subtitle")}
        actions={<span className="field__hint tnum">{entries.length}</span>}
      />

      <p className="notice notice--info">{t("admin.audit.immutableNote")}</p>

      <FilterLinks base={`/${locale}/admin/audit?entity=${entity}`} current={action} options={filters} label={t("admin.audit.filterAction")} />

      <form className="admin-toolbar" action={`/${locale}/admin/audit`} method="get">
        <label className="field" style={{ minWidth: "14rem" }}>
          <span className="label">{t("admin.audit.entity")}</span>
          <input className="input" type="search" name="entity" defaultValue={entity} placeholder="bookings" dir="ltr" />
        </label>
        <input type="hidden" name="action" value={action} />
        <button className="btn btn--outline btn--sm" type="submit">
          {t("admin.filter.apply")}
        </button>
      </form>

      <DataState locale={locale} dbReady={dbReady} isEmpty={entries.length === 0} emptyTitle="admin.audit.empty">
        <TableScroll>
          <thead>
            <tr>
              <th>{t("admin.audit.when")}</th>
              <th>{t("admin.audit.actor")}</th>
              <th>{t("admin.audit.action")}</th>
              <th>{t("admin.audit.entity")}</th>
              <th>{t("admin.audit.reason")}</th>
              <th>{t("admin.audit.diff")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="tnum">{formatDateTime(entry.createdAt, locale)}</td>
                <td>
                  <span translate="no">{entry.actorLabel ?? "—"}</span>
                  {entry.ip ? (
                    <div className="field__hint" translate="no">
                      {entry.ip}
                    </div>
                  ) : null}
                </td>
                <td translate="no">{entry.action}</td>
                <td>
                  <span translate="no">{entry.entity}</span>
                  <div className="field__hint" translate="no">
                    {entry.entityId ?? "—"}
                  </div>
                </td>
                <td style={{ whiteSpace: "normal", maxWidth: "18rem" }}>{entry.reason ?? "—"}</td>
                <td style={{ whiteSpace: "normal", maxWidth: "24rem" }}>
                  <code style={{ fontSize: "0.75rem", direction: "ltr", display: "block" }}>
                    {entry.before === null || entry.before === undefined ? "" : JSON.stringify(entry.before)}
                  </code>
                  <code style={{ fontSize: "0.75rem", direction: "ltr", display: "block", color: "var(--ink-soft)" }}>
                    {entry.after === null || entry.after === undefined ? "" : JSON.stringify(entry.after)}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      </DataState>
    </div>
  );
}
