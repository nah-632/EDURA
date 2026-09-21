import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminDenied } from "@/components/admin/AdminShell";
import { DocumentLink } from "@/components/admin/DocumentLink";
import { ActionButton } from "@/components/forms/ActionButton";
import { ActionForm } from "@/components/forms/ActionForm";
import { AdminHeading, BookingStatus, Money, PaymentStatus, StatusPill } from "@/components/admin/ui";
import { adminGate } from "@/lib/admin/guard";
import { getBookingAdmin } from "@/lib/admin/queries";
import { allowedTransitions } from "@/lib/booking/state";
import { createTranslator, formatDateTime, resolveLocale, type DictKey } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * /[locale]/admin/bookings/[id] — the screen where money and lessons meet (§15).
 *
 * The status buttons are generated from the STATE MACHINE, not from a list
 * written here: whatever the domain allows for an admin at this moment is what
 * the operator sees, so the console cannot offer a transition the server will
 * refuse, and adding a legal edge to `state.ts` makes it appear here for free.
 */
export default async function AdminBookingDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await adminGate("booking.read");
  if (!gate.ok) {
    if (gate.reason === "unauthenticated") redirect(`/${locale}/admin/login`);
    return <AdminDenied locale={locale} reason="forbidden" />;
  }

  const t = createTranslator(locale);
  const { data } = await getBookingAdmin(id);
  if (!data) notFound();
  const perms = gate.ctx.session.permissions;
  const { booking, payment, timeline, review } = data;
  const nextStatuses = allowedTransitions(booking.status, "admin");

  return (
    <div className="admin-section">
      <AdminHeading
        kicker={t("admin.bookings.title")}
        title={booking.code}
        subtitle={t("admin.bookings.timeline")}
        actions={
          <>
            <Link className="btn btn--quiet btn--sm" href={`/${locale}/admin/bookings`}>
              {t("cta.back")}
            </Link>
            <Link className="btn btn--outline btn--sm" href={`/${locale}/admin/tutors/${booking.tutorId}`}>
              {t("admin.nav.tutors")}
            </Link>
          </>
        }
      />

      <div className="admin-split">
        <div className="admin-section">
          <div className="card stack-sm">
            <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
              <BookingStatus locale={locale} status={booking.status} />
              <PaymentStatus locale={locale} status={booking.paymentStatus} />
              <span className="chip chip--pale">{booking.method === "online" ? t("tutor.card.online") : t("tutor.card.home")}</span>
            </div>
            <dl className="admin-meta">
              <div>
                <dt>{t("booking.step.tutor")}</dt>
                <dd>{booking.tutorName ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("booking.step.student")}</dt>
                <dd>{booking.customerName ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("booking.student.name")}</dt>
                <dd>{booking.studentName ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("label.subject")}</dt>
                <dd>{booking.subjectName ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("booking.step.lesson")}</dt>
                <dd>{booking.lessonTypeName ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("booking.step.schedule")}</dt>
                <dd className="tnum">
                  {booking.scheduledDate} · {booking.startTime} · {booking.durationMinutes} {t("label.minutes")}
                </dd>
              </div>
              <div>
                <dt>{t("label.area")}</dt>
                <dd>{booking.areaName ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("booking.address.note")}</dt>
                <dd>{booking.addressNote ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("label.price")}</dt>
                <dd>
                  <Money value={booking.price} locale={locale} />
                </dd>
              </div>
              <div>
                <dt>{t("auth.phone")}</dt>
                <dd translate="no" className="tnum">{booking.customerPhone}</dd>
              </div>
              <div>
                <dt>{t("auth.email")}</dt>
                <dd translate="no">{booking.customerEmail}</dd>
              </div>
            </dl>
            {booking.customerNotes ? <p className="soft">{booking.customerNotes}</p> : null}
            {booking.cancelReason ? (
              <p className="notice notice--warn">
                {t("booking.actions.cancelReason")}: {booking.cancelReason}
              </p>
            ) : null}
            {booking.zoomUrl ? (
              <p className="field__hint" translate="no">
                Zoom: {booking.zoomUrl}
              </p>
            ) : null}
          </div>

          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("payment.title")}</h2>
            {!payment ? (
              <p className="soft">{t("admin.payments.empty")}</p>
            ) : (
              <>
                <dl className="admin-meta">
                  <div>
                    <dt>{t("payment.reference")}</dt>
                    <dd translate="no" className="tnum">{payment.referenceCode}</dd>
                  </div>
                  <div>
                    <dt>{t("admin.payments.amount")}</dt>
                    <dd>
                      <Money value={payment.amount} locale={locale} />
                    </dd>
                  </div>
                  <div>
                    <dt>{t("payment.status")}</dt>
                    <dd>
                      <PaymentStatus locale={locale} status={payment.status} />
                    </dd>
                  </div>
                  <div>
                    <dt>{t("admin.payments.customerReference")}</dt>
                    <dd translate="no">{payment.customerReference ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("admin.payments.verifiedAt")}</dt>
                    <dd className="tnum">{payment.verifiedAt ? formatDateTime(payment.verifiedAt, locale) : "—"}</dd>
                  </div>
                </dl>

                <h3 style={{ fontSize: "0.95rem" }}>{t("admin.payments.proof")}</h3>
                {payment.proofs.length === 0 ? (
                  <p className="soft">{t("payment.manualNotice")}</p>
                ) : (
                  <ul className="admin-list">
                    {payment.proofs.map((proof) => (
                      <li key={proof.id}>
                        <span>
                          {proof.source === "in_platform" ? t("payment.proofStored") : t("admin.payments.proofExternal")}
                        </span>
                        <span className="admin-meta">
                          <span className="tnum">{formatDateTime(proof.createdAt, locale)}</span>
                          {proof.receivedNote ? <span>{proof.receivedNote}</span> : null}
                        </span>
                        {proof.source === "in_platform" ? (
                          <DocumentLink
                            locale={locale}
                            documentId={proof.id}
                            endpoint="payment-proofs"
                            label={t("admin.payments.proof")}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}

                {perms.has("payment.verify") || perms.has("payment.refund") ? (
                  <div className="admin-actions">
                    {perms.has("payment.verify") && payment.status !== "verified" ? (
                      <>
                        <ActionButton
                          locale={locale}
                          endpoint="/api/admin/payments"
                          payload={{ action: "verify", paymentId: payment.id }}
                          label={t("admin.payments.verify")}
                          variant="primary"
                          confirmText={t("admin.payments.verifyConfirm")}
                        />
                        <ActionButton
                          locale={locale}
                          endpoint="/api/admin/payments"
                          payload={{ action: "reject", paymentId: payment.id }}
                          label={t("admin.payments.reject")}
                          variant="danger"
                          reasonLabel={t("admin.payments.rejectReason")}
                          reasonRequired
                        />
                      </>
                    ) : null}
                    {perms.has("payment.refund") && payment.status === "verified" ? (
                      <ActionButton
                        locale={locale}
                        endpoint="/api/admin/payments"
                        payload={{ action: "refund", paymentId: payment.id }}
                        label={t("admin.payments.markRefunded")}
                        variant="danger"
                        reasonLabel={t("admin.payments.rejectReason")}
                        reasonRequired
                      />
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("admin.bookings.timeline")}</h2>
            {timeline.length === 0 ? (
              <p className="soft">{t("admin.audit.empty")}</p>
            ) : (
              <ol className="timeline">
                {timeline.map((entry) => (
                  <li key={entry.id}>
                    <span translate="no">{entry.action}</span>
                    <span className="field__hint">{entry.reason ?? entry.actorLabel ?? "—"}</span>
                    <time className="tnum" dateTime={new Date(entry.createdAt).toISOString()}>
                      {formatDateTime(entry.createdAt, locale)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className="admin-section">
          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("admin.bookings.statusChange")}</h2>
            {nextStatuses.length === 0 ? (
              <p className="soft">{t("admin.bookings.invalidTransition")}</p>
            ) : (
              <div className="admin-actions">
                {nextStatuses.map((status) => (
                  <ActionButton
                    key={status}
                    locale={locale}
                    endpoint="/api/admin/bookings"
                    payload={{ action: "set_status", bookingId: booking.id, to: status }}
                    label={t(`booking.status.${status}` as DictKey)}
                    variant={status === "cancelled" || status === "rejected" ? "danger" : "outline"}
                    reasonLabel={status === "cancelled" || status === "rejected" ? t("admin.bookings.changeReason") : undefined}
                    reasonRequired={status === "cancelled" || status === "rejected"}
                  />
                ))}
              </div>
            )}
            <p className="field__hint">{t("admin.bookings.subtitle")}</p>
          </div>

          {booking.method === "online" && perms.has("booking.update") ? (
            <ActionForm
              locale={locale}
              endpoint="/api/admin/bookings"
              title={t("admin.bookings.assignZoom")}
              variant="outline"
              extra={{ action: "set_zoom", bookingId: booking.id }}
              fields={[{ kind: "text", name: "zoomUrl", label: t("admin.bookings.assignZoom"), value: booking.zoomUrl, dir: "ltr" }]}
              submitLabel={t("cta.save")}
            />
          ) : null}

          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("review.title")}</h2>
            {!review ? (
              <p className="soft">{t("tutor.dashboard.noReviews")}</p>
            ) : (
              <>
                <span className="badge-verified">{t("admin.reviews.ratingValue", { rating: review.rating })}</span>
                <StatusPill tone={review.status === "published" ? "ok" : "warn"} label={t(`admin.reviews.status.${review.status}` as DictKey)} />
                {review.comment ? <p className="soft">{review.comment}</p> : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
