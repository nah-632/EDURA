import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionButton } from "@/components/forms/ActionButton";
import { ActionForm } from "@/components/forms/ActionForm";
import { BookingStatus, Money, PaymentStatus } from "@/components/admin/ui";
import { requirePageSession } from "@/lib/auth/server";
import { getTutorBooking } from "@/lib/bookings/queries";
import { allowedTransitions } from "@/lib/booking/state";
import { dbConfigured } from "@/lib/db";
import { createTranslator, formatDate, formatDuration, formatTime, resolveLocale, type DictKey } from "@/lib/i18n";
import { bahrainInstant } from "@/lib/booking/datetime";
import { buildWhatsAppMessage, whatsappLink } from "@/lib/whatsapp/message";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * /[locale]/tutor/bookings/[id] (§7.2, §12).
 *
 * The buttons a tutor sees are generated from the state machine with the actor
 * set to `tutor`, so the screen can only ever offer a move the domain allows -
 * and declining is offered only while the platform permits it (§41
 * `allowTutorDecline`), which the server also enforces independently.
 */
export default async function TutorBookingDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: rawLocale, id } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await requirePageSession({ requireTutor: true });
  if (!gate.ok) return null;
  const t = createTranslator(locale);
  if (!dbConfigured()) {
    return (
      <div className="card stack-xs">
        <strong>{t("error.notConfigured")}</strong>
        <p className="soft">{t("state.unavailable")}</p>
      </div>
    );
  }

  const booking = await getTutorBooking(gate.session.user.tutorId!, id);
  if (!booking) notFound();

  const settings = await getSettings();
  const startsAt = bahrainInstant(booking.scheduledDate, booking.startTime);
  const canAccept = allowedTransitions(booking.status, "tutor").includes("tutor_accepted");
  const canDecline = settings.allowTutorDecline && allowedTransitions(booking.status, "tutor").includes("rejected");
  const progressTargets = allowedTransitions(booking.status, "tutor").filter((status) =>
    ["scheduled", "in_progress", "completed"].includes(status),
  );

  const message = buildWhatsAppMessage(
    {
      code: booking.code,
      studentName: booking.studentName ?? "",
      tutorName: gate.session.user.fullName,
      subject: booking.subjectName,
      stage: booking.stageName ?? "",
      lessonType: booking.lessonTypeName,
      method: booking.method === "home" ? "home" : "online",
      date: booking.scheduledDate,
      time: booking.startTime,
      durationMinutes: booking.durationMinutes,
      amount: booking.price,
      area: booking.areaName,
      notes: null,
    },
    locale,
  );

  return (
    <div className="admin-section">
      <div className="row--between" style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div className="stack-xs">
          <span className="kicker tracked">{t("tutor.requests.title")}</span>
          <h1 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
            <span translate="no">{booking.code}</span>
          </h1>
        </div>
        <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          <BookingStatus locale={locale} status={booking.status} />
          <PaymentStatus locale={locale} status={booking.paymentStatus} />
          <Link className="btn btn--quiet btn--sm" href={`/${locale}/tutor/bookings`}>
            {t("cta.back")}
          </Link>
        </div>
      </div>

      <div className="admin-split">
        <div className="admin-section">
          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("tutor.requests.studentInfo")}</h2>
            <dl className="admin-meta">
              <div>
                <dt>{t("booking.student.name")}</dt>
                <dd>{booking.studentName ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("booking.student.stage")}</dt>
                <dd>{booking.stageName ?? "—"}</dd>
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

            {/* The customer's notes are shown in full: a tutor deciding whether
                to accept needs what the parent actually wrote. The student's
                surname and the family's address are NOT published to the tutor
                beyond what the lesson requires. */}
            {booking.customerNotes ? (
              <div className="stack-xs">
                <strong>{t("tutor.requests.customerNote")}</strong>
                <p className="soft">{booking.customerNotes}</p>
              </div>
            ) : null}
            {booking.addressNote ? (
              <p className="field__hint">
                {t("booking.address.note")}: {booking.addressNote}
              </p>
            ) : null}
            {booking.cancelReason ? (
              <p className="notice notice--warn">
                {t("booking.actions.cancelReason")}: <span translate="no">{booking.cancelReason}</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="admin-section">
          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("admin.actions.action")}</h2>
            <div className="admin-actions">
              {canAccept ? (
                <ActionButton
                  locale={locale}
                  endpoint="/api/tutor/bookings"
                  payload={{ action: "accept", bookingId: booking.id }}
                  label={t("tutor.requests.accept")}
                  variant="primary"
                  successText={t("tutor.requests.accepted")}
                />
              ) : null}
              {canDecline ? (
                <ActionButton
                  locale={locale}
                  endpoint="/api/tutor/bookings"
                  payload={{ action: "decline", bookingId: booking.id }}
                  label={t("tutor.requests.decline")}
                  variant="danger"
                  reasonLabel={t("tutor.requests.declineReason")}
                  reasonRequired
                  successText={t("tutor.requests.declined")}
                />
              ) : null}
              {progressTargets.map((status) => (
                <ActionButton
                  key={status}
                  locale={locale}
                  endpoint="/api/tutor/bookings"
                  payload={{ action: "progress", bookingId: booking.id, to: status }}
                  label={t(`booking.status.${status}` as DictKey)}
                  variant={status === "completed" ? "primary" : "outline"}
                  successText={t("admin.actions.done")}
                />
              ))}
            </div>
            <p className="field__hint">{t("tutor.requests.acceptNotice")}</p>
          </div>

          {booking.method === "online" ? (
            <ActionForm
              locale={locale}
              endpoint="/api/tutor/bookings"
              title={t("tutor.requests.zoomLink")}
              help={t("tutor.requests.zoomHelp")}
              extra={{ action: "set_meeting_link", bookingId: booking.id }}
              fields={[{ kind: "text", name: "url", label: t("tutor.requests.zoomLink"), value: booking.zoomUrl, dir: "ltr" }]}
              submitLabel={t("tutor.requests.zoomSave")}
            />
          ) : null}

          <div className="card stack-sm">
            <h2 style={{ fontSize: "1.05rem" }}>{t("legal.contact.title")}</h2>
            <a className="btn btn--outline btn--sm" href={`/${locale}/contact`}>
              {t("cta.contactUs")}
            </a>
            <a
              className="btn btn--quiet btn--sm"
              href={whatsappLink(settings.whatsappNumber, message)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("legal.contact.whatsapp")}
            </a>
            <p className="field__hint">{t("legal.safety.s2.body")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
