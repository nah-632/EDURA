import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminDenied } from "@/components/admin/AdminShell";
import { AdminHeading, BookingStatus, DataState, FilterLinks, Money, PaymentStatus, TableScroll } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/guard";
import { listBookingsAdmin } from "@/lib/admin/queries";
import { createTranslator, resolveLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/admin/bookings (§15).
 *
 * The list is read-only: every state change happens on the detail screen where
 * the operator can see the payment record, the timeline and the legal next
 * steps together. A status dropdown in a table row is how wrong transitions get
 * made.
 */
export default async function AdminBookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; search?: string; sort?: string; from?: string; to?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await adminGate("booking.read");
  if (!gate.ok) {
    if (gate.reason === "unauthenticated") redirect(`/${locale}/admin/login`);
    return <AdminDenied locale={locale} reason="forbidden" />;
  }

  const query = await searchParams;
  const status = query.status ?? "all";
  const search = query.search?.trim() ?? "";
  const sort = query.sort === "lessonDate" ? "lessonDate" : "newest";
  const t = createTranslator(locale);

  const { dbReady, data: bookings } = await listBookingsAdmin({
    status,
    search,
    sort,
    from: query.from,
    to: query.to,
    limit: 150,
  });

  const filters = [
    { value: "all", label: t("label.all") },
    { value: "pending_payment", label: t("booking.status.pending_payment") },
    { value: "payment_verification", label: t("booking.status.payment_verification") },
    { value: "paid", label: t("booking.status.paid") },
    { value: "confirmed", label: t("booking.status.confirmed") },
    { value: "scheduled", label: t("booking.status.scheduled") },
    { value: "completed", label: t("booking.status.completed") },
    { value: "cancelled", label: t("booking.status.cancelled") },
    { value: "refund_requested", label: t("booking.status.refund_requested") },
  ];

  return (
    <div className="admin-section">
      <AdminHeading
        kicker={t("admin.title")}
        title={t("admin.bookings.title")}
        subtitle={t("admin.bookings.subtitle")}
        actions={
          <Link className="btn btn--outline btn--sm" href={`/${locale}/admin/bookings?sort=${sort === "newest" ? "lessonDate" : "newest"}&status=${status}`}>
            {sort === "newest" ? t("admin.bookings.sortLessonDate") : t("admin.bookings.sortNewest")}
          </Link>
        }
      />

      <FilterLinks base={`/${locale}/admin/bookings?sort=${sort}`} current={status} options={filters} label={t("label.status")} />

      <form className="admin-toolbar" action={`/${locale}/admin/bookings`} method="get">
        <label className="field" style={{ minWidth: "14rem" }}>
          <span className="label">{t("label.search")}</span>
          <input className="input" type="search" name="search" defaultValue={search} placeholder="EDU-…" />
        </label>
        <label className="field">
          <span className="label">{t("admin.filter.from")}</span>
          <input className="input" type="date" name="from" defaultValue={query.from ?? ""} />
        </label>
        <label className="field">
          <span className="label">{t("admin.filter.to")}</span>
          <input className="input" type="date" name="to" defaultValue={query.to ?? ""} />
        </label>
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="sort" value={sort} />
        <button className="btn btn--outline btn--sm" type="submit">
          {t("admin.filter.apply")}
        </button>
        <Link className="btn btn--quiet btn--sm" href={`/${locale}/admin/bookings`}>
          {t("admin.filter.clear")}
        </Link>
      </form>

      <DataState locale={locale} dbReady={dbReady} isEmpty={bookings.length === 0} emptyTitle="admin.bookings.empty">
        <TableScroll>
          <thead>
            <tr>
              <th>{t("booking.idLabel")}</th>
              <th>{t("admin.audit.when")}</th>
              <th>{t("booking.step.tutor")}</th>
              <th>{t("booking.step.student")}</th>
              <th>{t("label.lesson")}</th>
              <th>{t("label.price")}</th>
              <th>{t("payment.title")}</th>
              <th>{t("label.status")}</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((booking) => (
              <tr key={booking.id}>
                <td className="tnum">
                  <Link href={`/${locale}/admin/bookings/${booking.id}`}>{booking.code}</Link>
                </td>
                <td className="tnum">
                  {booking.scheduledDate}
                  <div className="field__hint">{booking.startTime}</div>
                </td>
                <td>{booking.tutorName ?? "—"}</td>
                <td>{booking.customerName ?? "—"}</td>
                <td>
                  {booking.subjectName || "—"}
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
              </tr>
            ))}
          </tbody>
        </TableScroll>
      </DataState>
    </div>
  );
}
