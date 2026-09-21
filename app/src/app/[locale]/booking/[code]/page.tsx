import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ActionButton } from "@/components/forms/ActionButton";
import { UploadForm } from "@/components/forms/UploadForm";
import { BookingStatus, Money, PaymentStatus } from "@/components/admin/ui";
import { requirePageSession } from "@/lib/auth/server";
import { getCustomerBooking } from "@/lib/bookings/queries";
import { cancellableByCustomer } from "@/lib/bookings/actions";
import { createTranslator, formatDate, formatDuration, formatTime, resolveLocale } from "@/lib/i18n";
import { bahrainInstant } from "@/lib/booking/datetime";
import { buildWhatsAppMessage, whatsappLink } from "@/lib/whatsapp/message";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; code: string }> }): Promise<Metadata> {
  const { locale, code } = await params;
  const t = createTranslator(resolveLocale(locale));
  return { title: `${t("booking.created.title")} ${code}`, robots: { index: false, follow: false } };
}

/**
 * /[locale]/booking/[code] — the confirmation screen (§12.7, §13, §35).
 *
 * This is the page the customer lands on after booking, and it carries the
 * whole manual payment handoff: the booking reference, the BenefitPay amount and
 * destination, a WhatsApp deep link built from THIS booking's record, and a
 * place to record the proof. It reads as a checklist because that is what it is -
 * "pay, send the proof, wait for verification" - and it tells the customer
 * exactly which step they are on.
 */
export default async function BookingConfirmationPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale: rawLocale, code } = await params;
  const locale = resolveLocale(rawLocale);

  const gate = await requirePageSession();
  if (!gate.ok) redirect(`/${locale}/login`);
  const session = gate.session;

  const booking = await getCustomerBooking(session.user.id, code);
  if (!booking) {
    // The booking either does not exist or is not this account's: one answer for
    // both, so booking codes cannot be probed.
    redirect(`/${locale}/dashboard/bookings`);
  }

  const t = createTranslator(locale);
  const settings = await getSettings();
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
  const waLink = whatsappLink(settings.whatsappNumber, message);
  const paid = booking.paymentStatus === "verified" || booking.status === "paid" || booking.status === "confirmed";

  return (
    <section className="section">
      <div className="shell legal-layout">
        <header className="stack-sm">
          <span className="kicker tracked">{t("booking.created.title")}</span>
          <h1 className="display display--section">{booking.code}</h1>
          <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <BookingStatus locale={locale} status={booking.status} />
            <PaymentStatus locale={locale} status={booking.paymentStatus} />
          </div>
          <p className="lead">{t("booking.created.body")}</p>
        </header>

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
          </dl>
        </div>

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
            <div>
              <dt>{t("payment.reference")}</dt>
              <dd translate="no" className="tnum">
                {booking.code}
              </dd>
            </div>
          </dl>
          <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            {/* A plain anchor: the customer presses send themselves, and the
                platform never claims to have sent anything (§35). */}
            <a className="btn btn--primary" href={waLink} target="_blank" rel="noopener noreferrer">
              {t("whatsapp.openButton")}
            </a>
            <a className="btn btn--quiet" href={`tel:${settings.whatsappNumber.replace(/\s/g, "")}`} translate="no">
              {settings.whatsappNumber}
            </a>
          </div>
          <p className="field__hint">{t("booking.created.whatsappNote")}</p>
          {!paid ? <p className="notice notice--warn">{t("payment.notVerifiedYet")}</p> : null}
        </div>

        <div className="card stack-sm">
          <h2 style={{ fontSize: "1.05rem" }}>{t("payment.proofUpload")}</h2>
          <p className="soft">{t("whatsapp.paymentProof")}</p>
          <div className="grid grid--2">
            <UploadForm
              locale={locale}
              endpoint="/api/payments/proof"
              title={t("payment.proofStored")}
              extra={{ paymentId: booking.id, source: "in_platform" }}
              fields={[
                { kind: "text", name: "reference", label: t("payment.reference"), help: t("payment.referenceHelp"), dir: "ltr" },
              ]}
              fileLabel={t("payment.proofUpload")}
              fileHelp={t("payment.manualNotice")}
              submitLabel={t("cta.submit")}
              successText={t("payment.proofStored")}
            />
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
          </div>
        </div>

        <div className="card stack-sm">
          <h2 style={{ fontSize: "1.05rem" }}>{t("booking.detail.title")}</h2>
          <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
            <Link className="btn btn--outline btn--sm" href={`/${locale}/dashboard/bookings/${booking.id}`}>
              {t("booking.list.title")}
            </Link>
            {booking.tutorSlug ? (
              <Link className="btn btn--quiet btn--sm" href={`/${locale}/tutors/${booking.tutorSlug}`}>
                {t("cta.viewProfile")}
              </Link>
            ) : null}
            {cancellableByCustomer(booking.status) ? (
              <ActionButton
                locale={locale}
                endpoint="/api/me/bookings"
                payload={{ action: "cancel", bookingId: booking.id }}
                label={t("booking.actions.cancel")}
                variant="danger"
                confirmText={t("booking.actions.cancelConfirm")}
              />
            ) : null}
          </div>
          <p className="field__hint">
            {t("booking.actions.cancelReason")}: {settings.cancellationHours} {t("label.hours")}
          </p>
        </div>
      </div>
    </section>
  );
}
