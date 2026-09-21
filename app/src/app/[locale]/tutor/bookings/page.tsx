import Link from "next/link";

import { BookingStatus, DataState, Money, PaymentStatus, TableScroll } from "@/components/admin/ui";
import { requirePageSession } from "@/lib/auth/server";
import { listTutorBookings } from "@/lib/bookings/queries";
import { dbConfigured } from "@/lib/db";
import { createTranslator, formatDateTime, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/tutor/bookings (§7.2).
 *
 * Three scopes rather than one long list: requests need a decision, upcoming
 * lessons need preparation, and past lessons are the tutor's own history.
 * Accepting and declining happen on the detail screen, where the customer's
 * notes and the payment state are visible together.
 */
export default async function TutorBookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ scope?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await requirePageSession({ requireTutor: true });
  const query = await searchParams;
  const allowed = ["requests", "upcoming", "past", "all"] as const;
  const scope = allowed.includes((query.scope ?? "") as (typeof allowed)[number])
    ? ((query.scope ?? "requests") as (typeof allowed)[number])
    : "requests";
  const t = createTranslator(locale);
  if (!gate.ok) return null;

  const dbReady = dbConfigured();
  const bookings = dbReady ? await listTutorBookings(gate.session.user.tutorId!, scope).catch(() => []) : [];

  const tabs = [
    { key: "requests", label: t("tutor.requests.title") },
    { key: "upcoming", label: t("tutor.dashboard.upcoming") },
    { key: "past", label: t("booking.list.past") },
    { key: "all", label: t("booking.list.filterAll") },
  ];

  return (
    <div className="admin-section">
      <div className="stack-xs">
        <h1 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
          {t("tutor.requests.title")}
        </h1>
        <p className="field__hint">{t("tutor.requests.acceptNotice")}</p>
      </div>

      <nav className="admin-filter" aria-label={t("label.filter")}>
        {tabs.map((tab) => (
          <Link key={tab.key} href={`/${locale}/tutor/bookings?scope=${tab.key}`} aria-current={scope === tab.key ? "true" : undefined}>
            {tab.label}
          </Link>
        ))}
      </nav>

      <DataState locale={locale} dbReady={dbReady} isEmpty={bookings.length === 0} emptyTitle="tutor.requests.empty">
        <TableScroll>
          <thead>
            <tr>
              <th>{t("booking.idLabel")}</th>
              <th>{t("booking.student.name")}</th>
              <th>{t("label.lesson")}</th>
              <th>{t("label.date")}</th>
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
                  <Link href={`/${locale}/tutor/bookings/${booking.id}`}>{booking.code}</Link>
                </td>
                <td>{booking.studentName ?? booking.customerName ?? "—"}</td>
                <td>
                  {booking.subjectName}
                  <div className="field__hint">{booking.lessonTypeName}</div>
                </td>
                <td className="tnum">{formatDateTime(`${booking.scheduledDate}T${booking.startTime}:00+03:00`, locale)}</td>
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
                  <Link className="btn btn--quiet btn--sm" href={`/${locale}/tutor/bookings/${booking.id}`}>
                    {t("admin.users.detail")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      </DataState>
    </div>
  );
}
