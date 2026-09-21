import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminDenied } from "@/components/admin/AdminShell";
import { ActionButton } from "@/components/forms/ActionButton";
import { AdminHeading, DataState, FilterLinks, Money, TableScroll, TutorStatus } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/guard";
import { listTutorsAdmin, type TutorAdminRow } from "@/lib/admin/queries";
import { createTranslator, formatDateTime, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/admin/tutors (§15).
 *
 * The list is filtered by URL, and each row carries only the actions the
 * operator's permissions allow: approving needs `tutor.approve`, rejecting
 * needs `tutor.reject` with a written reason the tutor will read.
 */
export default async function AdminTutorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await adminGate("tutor.read");
  if (!gate.ok) {
    if (gate.reason === "unauthenticated") redirect(`/${locale}/admin/login`);
    return <AdminDenied locale={locale} reason="forbidden" />;
  }

  const query = await searchParams;
  const status = query.status ?? "all";
  const search = query.search?.trim() ?? "";
  const t = createTranslator(locale);
  const perms = gate.ctx.session.permissions;

  const { dbReady, data: tutors } = await listTutorsAdmin({ status, search, limit: 100 });

  const filters = [
    { value: "all", label: t("label.all") },
    { value: "pending", label: t("tutor.status.pending") },
    { value: "under_review", label: t("tutor.status.under_review") },
    { value: "approved", label: t("tutor.status.approved") },
    { value: "rejected", label: t("tutor.status.rejected") },
    { value: "suspended", label: t("tutor.status.suspended") },
    { value: "expired_subscription", label: t("tutor.status.expired_subscription") },
  ];

  return (
    <div className="admin-section">
      <AdminHeading
        kicker={t("admin.title")}
        title={t("admin.tutors.title")}
        subtitle={t("admin.tutors.subtitle")}
        actions={<span className="tnum field__hint">{t("admin.table.total")}: {tutors.length}</span>}
      />

      <FilterLinks base={`/${locale}/admin/tutors`} current={status} options={filters} label={t("admin.tutors.filterStatus")} />

      <DataState
        locale={locale}
        dbReady={dbReady}
        isEmpty={tutors.length === 0}
        emptyTitle="admin.tutors.empty"
        emptyBody="state.emptyBody"
      >
        <TableScroll>
          <thead>
            <tr>
              <th>{t("auth.fullName")}</th>
              <th>{t("label.status")}</th>
              <th>{t("label.area")}</th>
              <th>{t("label.price")}</th>
              <th>{t("admin.tutors.subscription")}</th>
              <th>{t("admin.tutors.documents")}</th>
              <th>{t("admin.actions.action")}</th>
            </tr>
          </thead>
          <tbody>
            {tutors.map((tutor: TutorAdminRow) => (
              <tr key={tutor.id}>
                <td>
                  <Link href={`/${locale}/admin/tutors/${tutor.id}`}>{tutor.fullName ?? tutor.email}</Link>
                  <div className="field__hint" translate="no">
                    {tutor.email}
                  </div>
                </td>
                <td>
                  <TutorStatus locale={locale} status={tutor.status} />
                </td>
                <td>{tutor.city ?? "—"}</td>
                <td>
                  <Money value={tutor.pricePerHour} locale={locale} />
                </td>
                <td>
                  {tutor.subscriptionStatus === "active" && tutor.subscriptionExpiresAt ? (
                    <span className="tnum">{formatDateTime(tutor.subscriptionExpiresAt, locale)}</span>
                  ) : (
                    <span className="muted">{t("tutor.subscription.none")}</span>
                  )}
                </td>
                <td className="tnum">{tutor.documentCount}</td>
                <td>
                  <div className="admin-actions">
                    <Link className="btn btn--quiet btn--sm" href={`/${locale}/admin/tutors/${tutor.id}`}>
                      {t("admin.users.detail")}
                    </Link>
                    {perms.has("tutor.approve") ? (
                      <ActionButton
                        locale={locale}
                        endpoint="/api/admin/tutors"
                        payload={{ action: "approve", tutorId: tutor.id }}
                        label={t("admin.tutors.approve")}
                        variant="primary"
                        successText={t("admin.actions.done")}
                        disabled={tutor.status === "approved"}
                      />
                    ) : null}
                    {perms.has("tutor.reject") && tutor.status !== "rejected" ? (
                      <ActionButton
                        locale={locale}
                        endpoint="/api/admin/tutors"
                        payload={{ action: "reject", tutorId: tutor.id }}
                        label={t("admin.tutors.reject")}
                        variant="danger"
                        reasonLabel={t("admin.tutors.rejectReason")}
                        reasonRequired
                        successText={t("admin.actions.done")}
                      />
                    ) : null}
                    {perms.has("tutor.suspend") && tutor.status === "approved" ? (
                      <ActionButton
                        locale={locale}
                        endpoint="/api/admin/tutors"
                        payload={{ action: "suspend", tutorId: tutor.id }}
                        label={t("admin.tutors.suspend")}
                        variant="danger"
                        reasonLabel={t("admin.tutors.suspendReason")}
                        reasonRequired
                        successText={t("admin.actions.done")}
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      </DataState>
    </div>
  );
}
