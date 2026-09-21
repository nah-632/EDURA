import { redirect } from "next/navigation";

import { AdminDenied } from "@/components/admin/AdminShell";
import { AdminHeading, DataState, TableScroll } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/guard";
import { listRolesAdmin } from "@/lib/admin/queries";
import { createTranslator, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/admin/roles (§15, §20).
 *
 * Read-only by design. The permission matrix lives in `lib/security/rbac.ts`
 * and is what the server enforces; the `roles`/`role_permissions` rows exist so
 * `user_roles` can be joined. An editor here would let the console diverge from
 * the checks that actually protect the platform, which is worse than no editor.
 * Granting a role to a user happens on the user's screen and is audited.
 */
export default async function AdminRolesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await adminGate("role.manage");
  if (!gate.ok) {
    if (gate.reason === "unauthenticated") redirect(`/${locale}/admin/login`);
    return <AdminDenied locale={locale} reason="forbidden" />;
  }

  const t = createTranslator(locale);
  const { dbReady, data: roles } = await listRolesAdmin();

  return (
    <div className="admin-section">
      <AdminHeading kicker={t("admin.title")} title={t("admin.roles.title")} subtitle={t("admin.roles.subtitle")} />

      <p className="notice notice--info">{t("admin.roles.subtitle")}</p>

      <DataState locale={locale} dbReady={dbReady} isEmpty={roles.length === 0} emptyTitle="state.emptyTitle">
        <TableScroll>
          <thead>
            <tr>
              <th>{t("admin.roles.role")}</th>
              <th>{t("admin.roles.permissions")}</th>
              <th>{t("admin.roles.userRoles")}</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.code}>
                <td>
                  <span translate="no">{role.code}</span>
                  <div className="field__hint">{locale === "ar" ? role.nameAr : role.nameEn}</div>
                </td>
                <td style={{ whiteSpace: "normal", maxWidth: "40rem" }}>
                  <span className="row" style={{ gap: "0.3rem", flexWrap: "wrap" }}>
                    {role.permissions.map((permission) => (
                      <span className="chip chip--pale" key={permission} translate="no">
                        {permission}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="tnum">{role.userCount}</td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      </DataState>

      <div className="card stack-xs">
        <strong>{t("admin.roles.grant")}</strong>
        <p className="soft">{t("admin.roles.subtitle")}</p>
        <p className="field__hint">{t("admin.roles.saved")}</p>
      </div>
    </div>
  );
}
