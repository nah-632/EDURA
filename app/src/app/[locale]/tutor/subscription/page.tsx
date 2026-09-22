import Link from "next/link";

import { ActionButton } from "@/components/forms/ActionButton";
import { StatusPill } from "@/components/admin/ui";
import { requirePageSession } from "@/lib/auth/server";
import { listPlans } from "@/lib/data/catalog";
import { getTutorSubscriptionView } from "@/lib/subscriptions/service";
import { getLaunchOfferStatus } from "@/lib/offers/launch";
import { getSettings } from "@/lib/settings";
import { dbConfigured } from "@/lib/db";
import { createTranslator, formatDateTime, formatMoney, resolveLocale, type DictKey } from "@/lib/i18n";
import { buildWhatsAppMessage, whatsappLink } from "@/lib/whatsapp/message";

export const dynamic = "force-dynamic";

/**
 * /[locale]/tutor/subscription (§3, §37).
 *
 * v1 billing is manual and the screen says so: requesting a plan creates a
 * PENDING subscription plus a payment record, the tutor pays by BenefitPay and
 * sends the proof on WhatsApp, and an admin's verification is what activates it.
 * Nothing here claims an automatic charge, because none exists.
 */
export default async function TutorSubscriptionPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = resolveLocale(rawLocale);
  const gate = await requirePageSession({ requireTutor: true });
  const t = createTranslator(locale);
  if (!gate.ok) return null;

  const tutorId = gate.session.user.tutorId!;
  const dbReady = dbConfigured();
  const [view, plans, settings, launchOffer] = await Promise.all([
    dbReady ? getTutorSubscriptionView(tutorId).catch(() => null) : Promise.resolve(null),
    listPlans(locale),
    getSettings(),
    getLaunchOfferStatus(),
  ]);

  const current = view?.subscription ?? null;
  const message = buildWhatsAppMessage(
    {
      code: current?.paymentReference ?? "SUB",
      studentName: "",
      tutorName: gate.session.user.fullName,
      subject: t("tutor.subscription.title"),
      stage: "",
      lessonType: current ? (locale === "ar" ? current.planNameAr : current.planNameEn) : "",
      method: "online",
      date: new Date().toISOString().slice(0, 10),
      time: "00:00",
      durationMinutes: 0,
      amount: current?.planPrice ?? plans[0]?.price ?? "0.000",
      notes: `${t("payment.instruction")} ${current?.paymentReference ?? ""}`.trim(),
    },
    locale,
  );

  return (
    <div className="admin-section">
      <div className="stack-xs">
        <h1 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
          {t("tutor.subscription.title")}
        </h1>
        <p className="field__hint">{t("tutor.subscription.renewHelp")}</p>
      </div>

      {/* The launch offer, where a tutor actually looks for pricing. Shown only
          while it is on AND a place is left, so it never promises a slot that
          has already gone. */}
      {launchOffer.active ? (
        <p className="notice notice--info">
          {t("pricing.launch.body", { limit: launchOffer.limit })}{" "}
          <strong>
            {t("pricing.launch.remaining", {
              remaining: launchOffer.remaining,
              limit: launchOffer.limit,
            })}
          </strong>
        </p>
      ) : null}

      <div className="card stack-sm">
        <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          <StatusPill
            tone={view?.phase === "active" ? "ok" : view?.phase === "grace" ? "warn" : "danger"}
            label={t(`tutor.subscription.status.${view?.phase === "grace" ? "active" : (view?.phase ?? "expired")}` as DictKey)}
          />
          {view && !view.listable ? <StatusPill tone="danger" label={t("tutor.subscription.blocked")} /> : null}
          {view?.phase === "grace" ? <StatusPill tone="warn" label={t("tutor.subscription.graceUntil")} /> : null}
        </div>

        {!current ? (
          <>
            <p className="soft">{t("tutor.subscription.none")}</p>
            <p className="field__hint">{t("tutor.subscription.noneBody")}</p>
          </>
        ) : (
          <dl className="admin-meta">
            <div>
              <dt>{t("tutor.subscription.plan")}</dt>
              <dd>{locale === "ar" ? current.planNameAr : current.planNameEn}</dd>
            </div>
            <div>
              <dt>{t("label.price")}</dt>
              <dd>{formatMoney(current.planPrice, locale)}</dd>
            </div>
            <div>
              <dt>{t("tutor.subscription.startDate")}</dt>
              <dd className="tnum">{current.startsAt ? formatDateTime(current.startsAt, locale) : "—"}</dd>
            </div>
            <div>
              <dt>{t("tutor.subscription.expiryDate")}</dt>
              <dd className="tnum">{current.expiresAt ? formatDateTime(current.expiresAt, locale) : "—"}</dd>
            </div>
            <div>
              <dt>{t("tutor.subscription.daysLeft")}</dt>
              <dd className="tnum">{view?.daysLeft ?? 0}</dd>
            </div>
            <div>
              <dt>{t("payment.status")}</dt>
              <dd>
                <span translate="no" className="tnum">
                  {current.paymentStatus ?? "—"}
                </span>
              </dd>
            </div>
          </dl>
        )}

        {current?.paymentReference && current.paymentStatus !== "verified" ? (
          <div className="stack-xs">
            <p className="soft">{t("payment.instructionLong")}</p>
            <dl className="admin-meta">
              <div>
                <dt>{t("payment.platformNumber")}</dt>
                <dd translate="no" className="tnum">
                  {settings.benefitPayNumber}
                </dd>
              </div>
              <div>
                <dt>{t("payment.reference")}</dt>
                <dd translate="no" className="tnum">
                  {current.paymentReference}
                </dd>
              </div>
            </dl>
            <a className="btn btn--primary btn--sm" href={whatsappLink(settings.whatsappNumber, message)} target="_blank" rel="noopener noreferrer">
              {t("whatsapp.openButton")}
            </a>
          </div>
        ) : null}
      </div>

      <div className="grid grid--2">
        {plans.map((plan) => (
          <div className="card plan stack-sm" key={plan.id}>
            <div className="row--between" style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
              <strong>{plan.name}</strong>
              {plan.isDemo ? <span className="chip">{t("misc.demoData")}</span> : null}
            </div>
            <p className="plan__price">
              <span className="tnum">{formatMoney(plan.price, locale)}</span>{" "}
              <span className="field__hint">
                / {plan.interval === "monthly" ? t("admin.plans.interval.monthly") : t("admin.plans.interval.annual")}
              </span>
            </p>
            <ul className="plan__features">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <p className="field__hint">
              {t("admin.plans.durationDays")}: <span className="tnum">{plan.durationDays}</span> · {t("admin.plans.graceDays")}:{" "}
              <span className="tnum">{plan.graceDays}</span>
            </p>
            <ActionButton
              locale={locale}
              endpoint="/api/tutor"
              payload={{ action: "request_plan", planId: plan.id }}
              label={t("tutor.subscription.requestRenewal")}
              variant="primary"
              successText={t("tutor.subscription.requested")}
              disabled={!dbReady || current?.status === "pending"}
              disabledReason={current?.status === "pending" ? t("tutor.subscription.noneBody") : undefined}
            />
          </div>
        ))}
      </div>

      <div className="card stack-xs">
        <strong>{t("pricing.faq.q1")}</strong>
        <p className="soft">{t("pricing.faq.a1")}</p>
        <p className="field__hint">{t("pricing.faq.a3")}</p>
        <Link className="btn btn--quiet btn--sm" href={`/${locale}/pricing`}>
          {t("pricing.title")}
        </Link>
      </div>
    </div>
  );
}
