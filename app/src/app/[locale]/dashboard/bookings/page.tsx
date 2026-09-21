import Link from "next/link";

import { BookingStatus, DataState, Money, PaymentStatus, TableScroll } from "@/components/admin/ui";
import { requirePageSession } from "@/lib/auth/server";
import { listCustomerBookings } from "@/lib/bookings/queries";
import { dbConfigured } from "@/lib/db";
import { createTranslator, formatDateTime, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/dashboard/bookings (§7.1).
 *
 * Upcoming and past are separate tabs because the two need different actions:
 * an upcoming booking can be cancelled or paid, a past one can be reviewed.
 */
export default async function CustomerBookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ scope?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await requirePageSession();
  const session = gate.ok ? gate.session : null;
  const query = await searchParams;
  const scope = query.scope === "past" || query.scope === "upcoming" ? query.scope : "all";
  const t = createTranslator(locale);

  let dbReady = dbConfigured();
  let bookings: Awaited<ReturnType<typeof listCustomerBookings>> = [];
  if (dbReady && session) {
    try {
      bookings = await listCustomerBookings(session.user.id, scope);
    } catch {
      dbReady = false;
    }
  }

  const tabs = [
    { key: "upcoming", label: t("booking.list.upcoming") },
    { key: "past", label: t("booking.list.past") },
    { key: "all", label: t("booking.list.filterAll") },
  ];

  return (
    <div className="admin-section">
      <h1 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
        {t("booking.list.title")}
      </h1>

      <nav className="admin-filter" aria-label={t("label.filter")}>
        {tabs.map((tab) => (
          <Link key={tab.key} href={`/${locale}/dashboard/bookings?scope=${tab.key}`} aria-current={scope === tab.key ? "true" : undefined}>
            {tab.label}
          </Link>
        ))}
      </nav>

      <DataState locale={locale} dbReady={dbReady} isEmpty={bookings.length === 0} emptyTitle="booking.list.empty" emptyBody="booking.list.emptyBody">
        <TableScroll>
          <thead>
            <tr>
              <th>{t("booking.idLabel")}</th>
              <th>{t("booking.step.tutor")}</th>
              <th>{t("label.lesson")}</th>
              <th>{t("label.price")}</th>
              <th>{t("payment.title")}</th>
              <th>{t("label.status")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {bookings.map((booking) => (
              <tr key={booking.id}>
                <td className="tnum">
                  <Link href={`/${locale}/dashboard/bookings/${booking.id}`}>{booking.code}</Link>
                  <div className="field__hint">{formatDateTime(`${booking.scheduledDate}T${booking.startTime}:00+03:00`, locale)}</div>
                </td>
                <td>{booking.tutorName ?? "—"}</td>
                <td>
                  {booking.subjectName}
                  <div className="field__hint">{booking.lessonTypeName}</div>
                </td>
                <td>
                  <Money value={booking.price} locale={locale} />
                </td>
                <td>
                  <PaymentStatus locale={locale} status={booking.paymentStatus} />
                </td>
                <td>
                  <BookingStatus locale={locale} status={booking.status} />
                </td>
                <td>
                  <Link className="btn btn--quiet btn--sm" href={`/${locale}/dashboard/bookings/${booking.id}`}>
                    {t("booking.detail.title")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      </DataState>

      <Link className="btn btn--primary btn--sm" href={`/${locale}/tutors`}>
        {t("dashboard.findTutor")}
      </Link>
    </div>
  );
}
