import { redirect } from "next/navigation";
import Link from "next/link";

import { AdminDenied } from "@/components/admin/AdminShell";
import { AdminHeading, BarChart, BookingStatus, Kpi, KpiGrid, Money, PaymentStatus, TableScroll } from "@/components/admin/ui";
import { getOverview } from "@/lib/admin/queries";
import { adminGate } from "@/lib/admin/guard";
import { createTranslator, formatAmount, formatDateTime, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/admin — overview (§16).
 *
 * Numbers come from the database, never from a fixture. When there is nothing
 * to show, the screen says so instead of drawing a flat-line chart: "no data
 * yet" and "this deployment has no database" are different states and the
 * console distinguishes them.
 */
export default async function AdminOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await adminGate("overview.read");
  if (!gate.ok) {
    if (gate.reason === "unauthenticated") redirect(`/${locale}/admin/login`);
    return <AdminDenied locale={locale} reason="forbidden" />;
  }

  const t = createTranslator(locale);
  const { dbReady, data } = await getOverview();

  return (
    <div className="admin-section">
      <AdminHeading
        kicker={t("admin.title")}
        title={t("admin.overview.title")}
        subtitle={dbReady ? t("admin.overview.last14") : undefined}
        actions={
          <>
            <Link className="btn btn--outline btn--sm" href={`/${locale}/admin/tutors?status=pending`}>
              {t("admin.tutors.title")}
            </Link>
            <Link className="btn btn--outline btn--sm" href={`/${locale}/admin/payments?status=submitted`}>
              {t("admin.payments.title")}
            </Link>
          </>
        }
      />

      {!dbReady ? (
        <div className="card stack-xs">
          <strong>{t("error.notConfigured")}</strong>
          <p className="field__hint">{t("admin.overview.noData")}</p>
        </div>
      ) : null}

      {/* Items that need a human decision come first: the overview exists to
          answer "what should I do now?", not to display vanity totals. */}
      <div className="card stack-sm">
        <h2 style={{ fontSize: "1.05rem" }}>{t("admin.overview.actionsNeeded")}</h2>
        {data.actionsNeeded.pendingTutors +
          data.actionsNeeded.pendingPayments +
          data.actionsNeeded.reportedReviews +
          data.actionsNeeded.unverifiedDocuments ===
        0 ? (
          <p className="soft">{t("admin.overview.nothingPending")}</p>
        ) : (
          <div className="admin-actions">
            {data.actionsNeeded.pendingTutors > 0 ? (
              <Link className="btn btn--primary btn--sm" href={`/${locale}/admin/tutors?status=pending`}>
                {t("admin.overview.pendingTutors")}: <span className="tnum">{data.actionsNeeded.pendingTutors}</span>
              </Link>
            ) : null}
            {data.actionsNeeded.pendingPayments > 0 ? (
              <Link className="btn btn--primary btn--sm" href={`/${locale}/admin/payments?status=submitted`}>
                {t("admin.overview.pendingPayments")}: <span className="tnum">{data.actionsNeeded.pendingPayments}</span>
              </Link>
            ) : null}
            {data.actionsNeeded.reportedReviews > 0 ? (
              <Link className="btn btn--outline btn--sm" href={`/${locale}/admin/reviews?status=reported`}>
                {t("admin.reviews.title")}: <span className="tnum">{data.actionsNeeded.reportedReviews}</span>
              </Link>
            ) : null}
            {data.actionsNeeded.unverifiedDocuments > 0 ? (
              <Link className="btn btn--outline btn--sm" href={`/${locale}/admin/tutors?status=under_review`}>
                {t("admin.tutors.documents")}: <span className="tnum">{data.actionsNeeded.unverifiedDocuments}</span>
              </Link>
            ) : null}
          </div>
        )}
      </div>

      <KpiGrid>
        <Kpi label={t("admin.overview.activeTutors")} value={data.tutors.listed} hint={t("admin.overview.activeTutors")} />
        <Kpi label={t("admin.overview.pendingTutors")} value={data.tutors.pending + data.tutors.underReview} warn={data.tutors.pending + data.tutors.underReview > 0} />
        <Kpi label={t("admin.overview.suspendedTutors")} value={data.tutors.suspended + data.tutors.expiredSubscription} />
        <Kpi label={t("admin.overview.students")} value={data.users.students} />
        <Kpi label={t("admin.overview.totalBookings")} value={data.bookings.total} />
        <Kpi label={t("booking.status.completed")} value={data.bookings.completed} />
        <Kpi
          label={t("admin.overview.pendingPayments")}
          value={data.payments.pending + data.payments.submitted}
          warn={data.payments.pending + data.payments.submitted > 0}
        />
        <Kpi label={t("admin.overview.revenue")} value={formatAmount(data.revenue.subscription)} hint={t("label.currency")} />
        <Kpi label={t("admin.overview.bookingRevenue")} value={formatAmount(data.revenue.booking)} hint={t("label.currency")} />
        <Kpi label={t("admin.overview.revenue")} value={formatAmount(data.revenue.thisMonth)} hint={t("admin.overview.last14")} />
      </KpiGrid>

      <div className="admin-split">
        <div className="admin-section">
          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("admin.overview.recentBookings")}</h2>
            {data.recentBookings.length === 0 ? (
              <p className="soft">{t("admin.overview.noData")}</p>
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
                  {data.recentBookings.map((booking) => (
                    <tr key={booking.id}>
                      <td className="tnum">
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

          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("admin.overview.last14")}</h2>
            <BarChart
              rows={data.chart.map((point) => ({ label: point.day.slice(5), value: point.bookings }))}
              emptyLabel={t("admin.overview.noData")}
            />
          </div>
        </div>

        <div className="admin-section">
          <div className="card stack-sm">
            <div className="row--between" style={{ display: "flex", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: "1.05rem" }}>{t("admin.overview.recentAudit")}</h2>
              <Link className="btn btn--quiet btn--sm" href={`/${locale}/admin/audit`}>
                {t("admin.audit.title")}
              </Link>
            </div>
            {data.recentAudit.length === 0 ? (
              <p className="soft">{t("admin.audit.empty")}</p>
            ) : (
              <ul className="admin-list">
                {data.recentAudit.map((entry) => (
                  <li key={entry.id}>
                    <span translate="no">{entry.action}</span>
                    <span className="admin-meta">
                      <span>{entry.actorLabel ?? "—"}</span>
                      <span className="tnum">{formatDateTime(entry.createdAt, locale)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("admin.payments.title")}</h2>
            <ul className="admin-list">
              <li>
                <span>{t("admin.payments.verifiedAt")}</span>
                <span className="admin-meta">
                  <PaymentStatus locale={locale} status="verified" />
                  <span className="tnum">{data.payments.verified}</span>
                </span>
              </li>
              <li>
                <span>{t("admin.overview.pendingPayments")}</span>
                <span className="admin-meta">
                  <PaymentStatus locale={locale} status="submitted" />
                  <span className="tnum">{data.payments.submitted}</span>
                </span>
              </li>
              <li>
                <span>{t("payment.status.refunded")}</span>
                <span className="admin-meta">
                  <PaymentStatus locale={locale} status="refunded" />
                  <span className="tnum">{data.payments.refunded}</span>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
