import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionButton } from "@/components/forms/ActionButton";
import { UploadForm } from "@/components/forms/UploadForm";
import { ReviewForm } from "@/components/booking/ReviewForm";
import { BookingStatus, Money, PaymentStatus, StatusPill } from "@/components/admin/ui";
import { requirePageSession } from "@/lib/auth/server";
import { cancellableByCustomer } from "@/lib/bookings/actions";
import { getCustomerBooking } from "@/lib/bookings/queries";
import { findReviewForBooking } from "@/lib/reviews/service";
import { dbConfigured } from "@/lib/db";
import { createTranslator, formatDate, formatDuration, formatTime, resolveLocale, type DictKey } from "@/lib/i18n";
import { bahrainInstant } from "@/lib/booking/datetime";
import { buildWhatsAppMessage, whatsappLink } from "@/lib/whatsapp/message";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * /[locale]/dashboard/bookings/[id] — the customer's view of one lesson (§7.1).
 *
 * Everything the customer can do to this booking is here, and only the actions
 * that are legal in its current state are offered: pay, send the proof, cancel,
 * ask for a refund, review. The WhatsApp message is rebuilt from the record, so
 * re-sending it later carries the same, correct details.
 */
export default async function CustomerBookingDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await requirePageSession();
  if (!gate.ok) notFound();
  const t = createTranslator(locale);

  const booking = await getCustomerBooking(gate.session.user.id, id);
  if (!booking) notFound();

  const [settings, review] = await Promise.all([
    getSettings(),
    dbConfigured() ? findReviewForBooking(booking.id).catch(() => null) : Promise.resolve(null),
  ]);

  const startsAt = bahrainInstant(booking.scheduledDate, booking.startTime);
  const message = buildWhatsAppMessage(
    {
      code: booking.code,
      studentName: booking.studentName ?? "",
      tutorName: booking.tutorName ?? "",
      subject: booking.subjectName,
      stage: booking.stageName ?? "",
      lessonType: booking.lessonTypeName,
      method: booking.method === "home" ? "home" : "online",
      date: booking.scheduledDate,
      time: booking.startTime,
      durationMinutes: booking.durationMinutes,
      amount: booking.price,
      area: booking.areaName,
      notes: booking.customerNotes,
    },
    locale,
  );

  const canCancel = cancellableByCustomer(booking.status);
  const canRefund =
    booking.status === "paid" ||
    booking.status === "confirmed" ||
    booking.status === "tutor_accepted" ||
    booking.status === "scheduled" ||
    booking.status === "in_progress" ||
    booking.status === "completed";
  const needsPayment = booking.status === "pending_payment" || booking.status === "payment_verification";

  return (
    <div className="admin-section">
      <div className="row--between" style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div className="stack-xs">
          <h1 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
            <span translate="no">{booking.code}</span>
          </h1>
        </div>
        <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          <BookingStatus locale={locale} status={booking.status} />
          <PaymentStatus locale={locale} status={booking.paymentStatus} />
          {booking.zoomUrl ? (
            <a className="btn btn--primary btn--sm" href={booking.zoomUrl} target="_blank" rel="noopener noreferrer">
              {t("booking.actions.addZoom")}
            </a>
          ) : null}
        </div>
      </div>

      <div className="admin-split">
        <div className="admin-section">
          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("booking.confirm.review")}</h2>
            <dl className="admin-meta">
              <div>
                <dt>{t("booking.step.tutor")}</dt>
                <dd>{booking.tutorName ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("booking.student.name")}</dt>
                <dd>{booking.studentName ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("label.subject")}</dt>
                <dd>{booking.subjectName}</dd>
              </div>
              <div>
                <dt>{t("booking.step.lesson")}</dt>
                <dd>{booking.lessonTypeName}</dd>
              </div>
              <div>
                <dt>{t("label.method")}</dt>
                <dd>{booking.method === "online" ? t("tutor.card.online") : t("tutor.card.home")}</dd>
              </div>
              <div>
                <dt>{t("label.date")}</dt>
                <dd className="tnum">{formatDate(startsAt, locale)}</dd>
              </div>
              <div>
                <dt>{t("label.time")}</dt>
                <dd className="tnum">{formatTime(startsAt, locale)}</dd>
              </div>
              <div>
                <dt>{t("label.duration")}</dt>
                <dd className="tnum">{formatDuration(booking.durationMinutes, locale)}</dd>
              </div>
              <div>
                <dt>{t("label.price")}</dt>
                <dd>
                  <Money value={booking.price} locale={locale} />
                </dd>
              </div>
              {booking.areaName ? (
                <div>
                  <dt>{t("label.area")}</dt>
                  <dd>{booking.areaName}</dd>
                </div>
              ) : null}
            </dl>
            {booking.addressNote ? <p className="soft">{booking.addressNote}</p> : null}
            {booking.customerNotes ? <p className="soft">{booking.customerNotes}</p> : null}
            {booking.cancelReason ? (
              <p className="notice notice--warn">
                {t("booking.actions.cancelReason")}: <span translate="no">{booking.cancelReason}</span>
              </p>
            ) : null}
          </div>

          {needsPayment ? (
            <div className="card card--accent stack-sm">
              <h2 style={{ fontSize: "1.05rem" }}>{t("payment.title")}</h2>
              <p className="soft">{t("payment.instructionLong")}</p>
              <dl className="admin-meta">
                <div>
                  <dt>{t("payment.amountToTransfer")}</dt>
                  <dd>
                    <Money value={booking.price} locale={locale} />
                  </dd>
                </div>
                <div>
                  <dt>{t("payment.platformNumber")}</dt>
                  <dd translate="no" className="tnum">
                    {settings.benefitPayNumber}
                  </dd>
                </div>
              </dl>
              <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                <a
                  className="btn btn--primary btn--sm"
                  href={whatsappLink(settings.whatsappNumber, message)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("whatsapp.openButton")}
                </a>
                <Link className="btn btn--outline btn--sm" href={`/${locale}/booking/${booking.code}`}>
                  {t("payment.proofUpload")}
                </Link>
              </div>
            </div>
          ) : null}

          {booking.status === "completed" ? (
            review ? (
              <div className="card stack-xs">
                <strong>{t("review.title")}</strong>
                <StatusPill tone={review.status === "published" ? "ok" : "warn"} label={t(`admin.reviews.status.${review.status}` as DictKey)} />
                <p className="field__hint">{t("review.pendingModeration")}</p>
              </div>
            ) : (
              <ReviewForm locale={locale} bookingId={booking.id} />
            )
          ) : null}

          {booking.status === "refund_requested" ? (
            <p className="notice notice--info">{t("booking.statusHelp.refund_requested")}</p>
          ) : null}
        </div>

        <div className="admin-section">
          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("admin.actions.action")}</h2>
            <div className="admin-actions">
              <a
                className="btn btn--primary btn--sm"
                href={whatsappLink(settings.whatsappNumber, message)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("booking.actions.contactWhatsapp")}
              </a>
              {booking.tutorSlug ? (
                <Link className="btn btn--outline btn--sm" href={`/${locale}/tutors/${booking.tutorSlug}`}>
                  {t("booking.actions.viewTutor")}
                </Link>
              ) : null}
              <Link className="btn btn--outline btn--sm" href={`/${locale}/tutors`}>
                {t("booking.actions.rebook")}
              </Link>
            </div>

            {canCancel ? (
              <ActionButton
                locale={locale}
                endpoint="/api/me/bookings"
                payload={{ action: "cancel", bookingId: booking.id }}
                label={t("booking.actions.cancel")}
                variant="danger"
                confirmText={t("booking.actions.cancelConfirm")}
                successText={t("booking.actions.cancelled")}
              />
            ) : null}

            {canRefund ? (
              <ActionButton
                locale={locale}
                endpoint="/api/me/bookings"
                payload={{ action: "request_refund", bookingId: booking.id }}
                label={t("booking.actions.cancelReason")}
                reasonLabel={t("booking.actions.cancelReason")}
                reasonRequired
              />
            ) : null}
          </div>

          {needsPayment ? (
            <UploadForm
              locale={locale}
              endpoint="/api/payments/proof"
              title={t("payment.proofExternal")}
              extra={{ paymentId: booking.id, source: "whatsapp_external" }}
              showFile={false}
              fields={[
                { kind: "textarea", name: "note", label: t("label.notes"), rows: 3 },
                { kind: "text", name: "reference", label: t("payment.reference"), dir: "ltr" },
              ]}
              fileLabel={t("payment.proofUpload")}
              submitLabel={t("cta.submit")}
              successText={t("payment.proofRecorded")}
            />
          ) : null}

          <div className="card stack-xs">
            <strong>{t(`booking.status.${booking.status}` as DictKey)}</strong>
            <p className="soft">{t(`booking.statusHelp.${booking.status}` as DictKey)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
