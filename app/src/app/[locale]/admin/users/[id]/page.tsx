import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminDenied } from "@/components/admin/AdminShell";
import { ActionButton } from "@/components/forms/ActionButton";
import { AdminHeading, BookingStatus, Money, TableScroll, UserStatus } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/guard";
import { getUserAdmin } from "@/lib/admin/queries";
import { createTranslator, formatDateTime, resolveLocale, type DictKey } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/admin/users/[id] (§15).
 *
 * The student records shown here are MINOR DATA: they are visible to an admin
 * because moderation needs them, are never rendered on any public page, and the
 * screen says so rather than leaving the operator guessing.
 */
export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await adminGate("user.read");
  if (!gate.ok) {
    if (gate.reason === "unauthenticated") redirect(`/${locale}/admin/login`);
    return <AdminDenied locale={locale} reason="forbidden" />;
  }

  const t = createTranslator(locale);
  const { data } = await getUserAdmin(id);
  if (!data) notFound();
  const perms = gate.ctx.session.permissions;
  const { user } = data;

  return (
    <div className="admin-section">
      <AdminHeading
        kicker={t("admin.users.title")}
        title={user.fullName ?? user.email}
        subtitle={`${t("admin.audit.entityId")}: ${user.id}`}
        actions={
          <Link className="btn btn--quiet btn--sm" href={`/${locale}/admin/users`}>
            {t("cta.back")}
          </Link>
        }
      />

      <div className="admin-split">
        <div className="admin-section">
          <div className="card stack-sm">
            <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
              <UserStatus locale={locale} status={user.status} />
              <span className="chip chip--pale">{t(`admin.users.role.${user.primaryRole}` as DictKey)}</span>
              {user.mfaEnabled ? <span className="chip chip--gold">MFA</span> : null}
              {data.tutorId ? (
                <Link className="chip chip--pale" href={`/${locale}/admin/tutors/${data.tutorId}`}>
                  {t("admin.nav.tutors")}
                </Link>
              ) : null}
            </div>
            <dl className="admin-meta">
              <div>
                <dt>{t("auth.phone")}</dt>
                <dd translate="no" className="tnum">{user.phone}</dd>
              </div>
              <div>
                <dt>{t("auth.email")}</dt>
                <dd translate="no">{user.email}</dd>
              </div>
              <div>
                <dt>{t("account.preferredLocale")}</dt>
                <dd>{user.locale}</dd>
              </div>
              <div>
                <dt>{t("label.date")}</dt>
                <dd className="tnum">{formatDateTime(user.createdAt, locale)}</dd>
              </div>
              <div>
                <dt>{t("admin.users.bookings")}</dt>
                <dd className="tnum">{user.bookingCount}</dd>
              </div>
              <div>
                <dt>{t("students.title")}</dt>
                <dd className="tnum">{user.studentCount}</dd>
              </div>
            </dl>
          </div>

          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("students.title")}</h2>
            {data.students.length === 0 ? (
              <p className="soft">{t("students.empty")}</p>
            ) : (
              <>
                <p className="notice notice--info">{t("students.minorNote")}</p>
                <TableScroll>
                  <thead>
                    <tr>
                      <th>{t("booking.student.name")}</th>
                      <th>{t("booking.student.grade")}</th>
                      <th>{t("students.minorNote")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.map((student) => (
                      <tr key={student.id}>
                        <td>{student.fullName}</td>
                        <td>{student.grade ?? "—"}</td>
                        <td>{student.isMinor ? t("label.yes") : t("label.no")}</td>
                      </tr>
                    ))}
                  </tbody>
                </TableScroll>
              </>
            )}
          </div>

          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("admin.users.bookings")}</h2>
            {data.bookings.length === 0 ? (
              <p className="soft">{t("admin.bookings.empty")}</p>
            ) : (
              <TableScroll>
                <thead>
                  <tr>
                    <th>{t("booking.idLabel")}</th>
                    <th>{t("booking.step.tutor")}</th>
                    <th>{t("label.date")}</th>
                    <th>{t("label.price")}</th>
                    <th>{t("label.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bookings.map((booking) => (
                    <tr key={booking.id}>
                      <td>
                        <Link href={`/${locale}/admin/bookings/${booking.id}`}>{booking.code}</Link>
                      </td>
                      <td>{booking.tutorName ?? "—"}</td>
                      <td className="tnum">
                        {booking.scheduledDate} {booking.startTime}
                      </td>
                      <td>
                        <Money value={booking.price} locale={locale} />
                      </td>
                      <td>
                        <BookingStatus locale={locale} status={booking.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableScroll>
            )}
          </div>
        </div>

        <div className="admin-section">
          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("admin.actions.action")}</h2>
            <div className="admin-actions">
              {perms.has("user.restrict") ? (
                <ActionButton
                  locale={locale}
                  endpoint="/api/admin/users"
                  payload={{ action: "restrict", userId: user.id }}
                  label={t("admin.users.restrict")}
                  reasonLabel={t("admin.users.restrictNote")}
                  reasonRequired
                  disabled={user.status === "restricted"}
                />
              ) : null}
              {perms.has("user.ban") ? (
                <>
                  <ActionButton
                    locale={locale}
                    endpoint="/api/admin/users"
                    payload={{ action: "suspend", userId: user.id }}
                    label={t("admin.users.suspend")}
                    variant="danger"
                    reasonLabel={t("admin.users.suspendNote")}
                    reasonRequired
                    disabled={user.status === "suspended"}
                  />
                  <ActionButton
                    locale={locale}
                    endpoint="/api/admin/users"
                    payload={{ action: "reactivate", userId: user.id }}
                    label={t("admin.users.reactivate")}
                    variant="primary"
                    disabled={user.status === "active"}
                  />
                </>
              ) : null}
            </div>
            <p className="field__hint">{t("admin.users.suspendNote")}</p>
          </div>

          {perms.has("role.manage") ? (
            <div className="card stack-sm">
              <h2 style={{ fontSize: "1.05rem" }}>{t("admin.roles.userRoles")}</h2>
              <p className="soft">{data.roles.length > 0 ? data.roles.join(" · ") : t("state.unavailable")}</p>
              <div className="admin-actions">
                {(["admin", "moderator", "support"] as const).map((code) => {
                  const granted = data.roles.includes(code);
                  return (
                    <ActionButton
                      key={code}
                      locale={locale}
                      endpoint="/api/admin/users"
                      payload={{ action: granted ? "revoke_role" : "grant_role", userId: user.id, roleCode: code }}
                      label={`${granted ? t("admin.roles.revoke") : t("admin.roles.grant")} · ${code}`}
                      variant={granted ? "danger" : "outline"}
                    />
                  );
                })}
              </div>
              <p className="field__hint">{t("admin.roles.subtitle")}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
