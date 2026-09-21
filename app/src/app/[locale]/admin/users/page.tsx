import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminDenied } from "@/components/admin/AdminShell";
import { ActionButton } from "@/components/forms/ActionButton";
import { AdminHeading, DataState, FilterLinks, TableScroll, UserStatus } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/guard";
import { listUsersAdmin } from "@/lib/admin/queries";
import { createTranslator, formatDateTime, resolveLocale, type DictKey } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/admin/users (§15).
 *
 * Restricting and suspending are separate powers with separate permissions, and
 * both demand a reason - the customer reads it. Reactivating is the one action
 * that needs no reason, because nothing is being taken away.
 */
export default async function AdminUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ role?: string; status?: string; search?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await adminGate("user.read");
  if (!gate.ok) {
    if (gate.reason === "unauthenticated") redirect(`/${locale}/admin/login`);
    return <AdminDenied locale={locale} reason="forbidden" />;
  }

  const query = await searchParams;
  const role = query.role ?? "all";
  const status = query.status ?? "all";
  const search = query.search?.trim() ?? "";
  const t = createTranslator(locale);
  const perms = gate.ctx.session.permissions;

  const { dbReady, data: users } = await listUsersAdmin({ role, status, search, limit: 100 });

  const roleFilters = [
    { value: "all", label: t("label.all") },
    { value: "student", label: t("admin.users.role.student") },
    { value: "parent", label: t("admin.users.role.parent") },
    { value: "tutor", label: t("admin.users.role.tutor") },
    { value: "admin", label: t("admin.users.role.admin") },
  ];
  const statusFilters = [
    { value: "all", label: t("label.all") },
    { value: "active", label: t("admin.users.status.active") },
    { value: "restricted", label: t("admin.users.status.restricted") },
    { value: "suspended", label: t("admin.users.status.suspended") },
  ];

  return (
    <div className="admin-section">
      <AdminHeading
        kicker={t("admin.title")}
        title={t("admin.users.title")}
        subtitle={t("admin.users.subtitle")}
        actions={<span className="field__hint tnum">{t("admin.table.total")}: {users.length}</span>}
      />

      <FilterLinks base={`/${locale}/admin/users?role=${role}`} current={status} options={statusFilters} label={t("label.status")} />
      <FilterLinks base={`/${locale}/admin/users?status=${status}`} current={role} options={roleFilters} label={t("admin.users.role")} />

      <form className="admin-toolbar" action={`/${locale}/admin/users`} method="get">
        <label className="field" style={{ minWidth: "16rem" }}>
          <span className="label">{t("label.search")}</span>
          <input className="input" type="search" name="search" defaultValue={search} placeholder={t("admin.tutors.searchPlaceholder")} />
        </label>
        <input type="hidden" name="role" value={role} />
        <input type="hidden" name="status" value={status} />
        <button className="btn btn--outline btn--sm" type="submit">
          {t("cta.search")}
        </button>
      </form>

      <DataState locale={locale} dbReady={dbReady} isEmpty={users.length === 0} emptyTitle="admin.users.empty">
        <TableScroll>
          <thead>
            <tr>
              <th>{t("auth.fullName")}</th>
              <th>{t("admin.users.role")}</th>
              <th>{t("admin.users.status")}</th>
              <th>{t("label.date")}</th>
              <th>{t("admin.bookings.title")}</th>
              <th>{t("admin.actions.action")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <Link href={`/${locale}/admin/users/${user.id}`}>{user.fullName ?? user.email}</Link>
                  <div className="field__hint" translate="no">
                    {user.phone}
                  </div>
                </td>
                <td>{t(`admin.users.role.${user.primaryRole}` as DictKey)}</td>
                <td>
                  <UserStatus locale={locale} status={user.status} />
                </td>
                <td className="tnum">{formatDateTime(user.createdAt, locale)}</td>
                <td className="tnum">{user.bookingCount}</td>
                <td>
                  <div className="admin-actions">
                    <Link className="btn btn--quiet btn--sm" href={`/${locale}/admin/users/${user.id}`}>
                      {t("admin.users.detail")}
                    </Link>
                    {perms.has("user.restrict") && user.status === "active" ? (
                      <ActionButton
                        locale={locale}
                        endpoint="/api/admin/users"
                        payload={{ action: "restrict", userId: user.id }}
                        label={t("admin.users.restrict")}
                        reasonLabel={t("admin.users.restrictNote")}
                        reasonRequired
                      />
                    ) : null}
                    {perms.has("user.ban") && user.status !== "suspended" ? (
                      <ActionButton
                        locale={locale}
                        endpoint="/api/admin/users"
                        payload={{ action: "suspend", userId: user.id }}
                        label={t("admin.users.suspend")}
                        variant="danger"
                        reasonLabel={t("admin.users.suspendNote")}
                        reasonRequired
                      />
                    ) : null}
                    {perms.has("user.ban") && user.status !== "active" ? (
                      <ActionButton
                        locale={locale}
                        endpoint="/api/admin/users"
                        payload={{ action: "reactivate", userId: user.id }}
                        label={t("admin.users.reactivate")}
                        variant="primary"
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
