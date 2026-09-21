import Link from "next/link";

import { BookingStatus, Kpi, KpiGrid, Money, StatusPill, TableScroll } from "@/components/admin/ui";
import { requirePageSession } from "@/lib/auth/server";
import { listTutorBookings, tutorCounts } from "@/lib/bookings/queries";
import { getTutorDashboard } from "@/lib/tutor/service";
import { dbConfigured } from "@/lib/db";
import { createTranslator, formatDateTime, resolveLocale, type DictKey } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/tutor — the tutor's dashboard (§7.2, §37).
 *
 * The first thing a tutor needs to know is whether they are VISIBLE, and why -
 * so the visibility state leads the page, with the reason (pending review,
 * subscription expired) next to it rather than buried in a settings screen.
 */
export default async function TutorDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await requirePageSession({ requireTutor: true });
  const t = createTranslator(locale);
  if (!gate.ok) return null;

  const dbReady = dbConfigured();
  const dashboard = dbReady ? await getTutorDashboard(gate.session.user.id).catch(() => null) : null;
  const counts = dashboard ? await tutorCounts(dashboard.profile.id).catch(() => null) : null;
  const requests = dashboard ? await listTutorBookings(dashboard.profile.id, "requests").catch(() => []) : [];

  if (!dashboard) {
    return (
      <div className="card stack-xs">
        <strong>{t("error.notConfigured")}</strong>
        <p className="soft">{t("tutor.statusHelp.pending")}</p>
      </div>
    );
  }

  const { profile, subscription } = dashboard;
  const visible = profile.status === "approved" && subscription.listable;

  return (
    <div className="admin-section">
      <div className="card stack-sm">
        <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          <StatusPill tone={visible ? "ok" : "warn"} label={t("tutor.dashboard.visibility")} />
          <StatusPill tone={profile.status === "approved" ? "ok" : "warn"} label={t(`tutor.status.${profile.status}` as DictKey)} />
          <StatusPill
            tone={subscription.phase === "active" ? "ok" : subscription.phase === "grace" ? "warn" : "danger"}
            label={t(`tutor.subscription.status.${subscription.phase === "grace" ? "active" : subscription.phase}` as DictKey)}
          />
        </div>
        <p className="soft">{t(`tutor.statusHelp.${profile.status}` as DictKey)}</p>
        {profile.rejectionReason ? (
          <p className="notice notice--warn">
            {t("tutor.rejectionReason")}: {profile.rejectionReason}
          </p>
        ) : null}
        <div className="admin-actions">
          <Link className="btn btn--outline btn--sm" href={`/${locale}/tutor/profile`}>
            {t("tutor.form.submit")}
          </Link>
          <Link className="btn btn--outline btn--sm" href={`/${locale}/tutor/documents`}>
            {t("tutor.documents.title")}
          </Link>
          {profile.slug && visible ? (
            <Link className="btn btn--quiet btn--sm" href={`/${locale}/tutors/${profile.slug}`}>
              {t("cta.viewProfile")}
            </Link>
          ) : null}
        </div>
      </div>

      <KpiGrid>
        <Kpi label={t("tutor.dashboard.newRequests")} value={counts?.newRequests ?? 0} warn={(counts?.newRequests ?? 0) > 0} />
        <Kpi label={t("tutor.dashboard.upcoming")} value={counts?.upcoming ?? 0} />
        <Kpi label={t("tutor.dashboard.stats.completed")} value={counts?.completed ?? 0} />
        <Kpi label={t("tutor.dashboard.stats.rating")} value={counts?.ratingAvg ?? "—"} hint={`${counts?.ratingCount ?? 0} ${t("label.reviews")}`} />
        <Kpi label={t("tutor.dashboard.stats.earnings")} value={counts?.grossValue ?? "0.000"} hint={t("tutor.dashboard.stats.earningsNote")} />
        <Kpi label={t("tutor.subscription.daysLeft")} value={subscription.daysLeft} />
      </KpiGrid>

      <div className="admin-split">
        <div className="admin-section">
          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("tutor.dashboard.newRequests")}</h2>
            {requests.length === 0 ? (
              <p className="soft">{t("tutor.requests.empty")}</p>
            ) : (
              <TableScroll>
                <thead>
                  <tr>
                    <th>{t("booking.idLabel")}</th>
                    <th>{t("booking.student.name")}</th>
                    <th>{t("label.date")}</th>
                    <th>{t("label.price")}</th>
                    <th>{t("label.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.slice(0, 5).map((booking) => (
                    <tr key={booking.id}>
                      <td className="tnum">
                        <Link href={`/${locale}/tutor/bookings/${booking.id}`}>{booking.code}</Link>
                      </td>
                      <td>{booking.studentName ?? booking.customerName ?? "—"}</td>
                      <td className="tnum">{formatDateTime(`${booking.scheduledDate}T${booking.startTime}:00+03:00`, locale)}</td>
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
            <Link className="btn btn--outline btn--sm" href={`/${locale}/tutor/bookings?scope=requests`}>
              {t("tutor.requests.title")}
            </Link>
          </div>
        </div>

        <div className="admin-section">
          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("tutor.subscription.title")}</h2>
            {subscription.subscription ? (
              <>
                <p className="soft">
                  {locale === "ar" ? subscription.subscription.planNameAr : subscription.subscription.planNameEn}
                </p>
                <dl className="admin-meta">
                  <div>
                    <dt>{t("tutor.subscription.expiryDate")}</dt>
                    <dd className="tnum">
                      {subscription.subscription.expiresAt
                        ? formatDateTime(subscription.subscription.expiresAt, locale)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("tutor.subscription.daysLeft")}</dt>
                    <dd className="tnum">{subscription.daysLeft}</dd>
                  </div>
                  <div>
                    <dt>{t("tutor.subscription.plan")}</dt>
                    <dd>
                      <Money value={subscription.subscription.planPrice} locale={locale} />
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <>
                <p className="soft">{t("tutor.subscription.none")}</p>
                <p className="field__hint">{t("tutor.subscription.noneBody")}</p>
              </>
            )}
            <Link className="btn btn--primary btn--sm" href={`/${locale}/tutor/subscription`}>
              {t("tutor.subscription.renew")}
            </Link>
          </div>

          <div className="card stack-xs">
            <strong>{t("tutor.statusHelp.approved")}</strong>
            <p className="soft">{t("tutor.dashboard.visibility")}</p>
            <p className="field__hint">{t("guarantee.verification.body")}</p>
            <Link className="btn btn--quiet btn--sm" href={`/${locale}/legal/guarantee`}>
              {t("guarantee.cta")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
