import Link from "next/link";

import { BookingStatus, DataState, Kpi, KpiGrid, Money } from "@/components/admin/ui";
import { requirePageSession } from "@/lib/auth/server";
import { customerCounts, listCustomerBookings } from "@/lib/bookings/queries";
import { dbConfigured } from "@/lib/db";
import { createTranslator, formatDate, formatTime, resolveLocale } from "@/lib/i18n";
import { bahrainInstant } from "@/lib/booking/datetime";

export const dynamic = "force-dynamic";

/**
 * /[locale]/dashboard — the customer's home (§7.1, §26).
 *
 * Answers three questions in order: what is happening next, what needs my
 * attention, and where do I go to book. The "needs attention" row is driven by
 * real state (unpaid bookings, a lesson today) rather than a static tip.
 */
export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await requirePageSession();
  const session = gate.ok ? gate.session : null;
  const t = createTranslator(locale);

  const dbReady = dbConfigured();
  let counts = { active: 0, completed: 0, cancelled: 0, students: 0, reviews: 0 };
  let upcoming: Awaited<ReturnType<typeof listCustomerBookings>> = [];
  if (dbReady && session) {
    try {
      [counts, upcoming] = await Promise.all([
        customerCounts(session.user.id),
        listCustomerBookings(session.user.id, "upcoming"),
      ]);
    } catch {
      upcoming = [];
    }
  }

  const next = upcoming
    .slice()
    .sort((a, b) =>
      `${a.scheduledDate}${a.startTime}`.localeCompare(`${b.scheduledDate}${b.startTime}`),
    )[0];
  const awaitingPayment = upcoming.filter((booking) => booking.status === "pending_payment");

  return (
    <div className="admin-section">
      <KpiGrid>
        <Kpi label={t("dashboard.stats.activeBookings")} value={counts.active} />
        <Kpi label={t("dashboard.stats.completed")} value={counts.completed} />
        <Kpi label={t("dashboard.stats.students")} value={counts.students} />
        <Kpi label={t("dashboard.stats.reviews")} value={counts.reviews} />
      </KpiGrid>

      <div className="admin-split">
        <div className="admin-section">
          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("dashboard.upcomingLesson")}</h2>
            {!next ? (
              <p className="soft">{t("dashboard.noUpcoming")}</p>
            ) : (
              <>
                <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                  <BookingStatus locale={locale} status={next.status} />
                  <Link className="tnum" href={`/${locale}/dashboard/bookings/${next.id}`}>
                    {next.code}
                  </Link>
                </div>
                <dl className="admin-meta">
                  <div>
                    <dt>{t("booking.step.tutor")}</dt>
                    <dd>{next.tutorName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("label.subject")}</dt>
                    <dd>{next.subjectName}</dd>
                  </div>
                  <div>
                    <dt>{t("label.date")}</dt>
                    <dd className="tnum">
                      {formatDate(bahrainInstant(next.scheduledDate, next.startTime), locale)} ·{" "}
                      {formatTime(bahrainInstant(next.scheduledDate, next.startTime), locale)}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("label.price")}</dt>
                    <dd>
                      <Money value={next.price} locale={locale} />
                    </dd>
                  </div>
                </dl>
                <Link className="btn btn--primary btn--sm" href={`/${locale}/dashboard/bookings/${next.id}`}>
                  {t("booking.detail.title")}
                </Link>
              </>
            )}
          </div>

          {awaitingPayment.length > 0 ? (
            <div className="card card--accent stack-sm">
              <h2 style={{ fontSize: "1.05rem" }}>{t("payment.title")}</h2>
              <p className="soft">{t("payment.instructionLong")}</p>
              <ul className="admin-list">
                {awaitingPayment.map((booking) => (
                  <li key={booking.id}>
                    <Link href={`/${locale}/booking/${booking.code}`}>{booking.code}</Link>
                    <span className="admin-meta">
                      <Money value={booking.price} locale={locale} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="admin-section">
          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("dashboard.quickActions")}</h2>
            <div className="admin-actions">
              <Link className="btn btn--primary btn--sm" href={`/${locale}/tutors`}>
                {t("dashboard.findTutor")}
              </Link>
              <Link className="btn btn--outline btn--sm" href={`/${locale}/dashboard/students`}>
                {t("dashboard.addStudent")}
              </Link>
              <Link className="btn btn--outline btn--sm" href={`/${locale}/dashboard/bookings`}>
                {t("dashboard.viewBookings")}
              </Link>
              <Link className="btn btn--quiet btn--sm" href={`/${locale}/about`}>
                {t("home.about.link")}
              </Link>
            </div>
          </div>

          <div className="card stack-xs">
            <strong>{t("legal.privacy.minorBadge")}</strong>
            <p className="soft">{t("students.minorNote")}</p>
            <Link className="btn btn--quiet btn--sm" href={`/${locale}/legal/privacy`}>
              {t("legal.privacy.title")}
            </Link>
          </div>

          {!dbReady ? <DataState locale={locale} dbReady={dbReady} isEmpty={false}>{null}</DataState> : null}
        </div>
      </div>
    </div>
  );
}
