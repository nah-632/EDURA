import type { Metadata } from "next";
import Link from "next/link";

import { createTranslator, formatMoney, type Locale } from "@/lib/i18n";
import { listPlans } from "@/lib/data/catalog";
import { getLaunchOfferStatus } from "@/lib/offers/launch";
import { getSettings } from "@/lib/settings";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator(locale as Locale);
  return {
    title: t("pricing.title"),
    description: t("pricing.lead"),
    alternates: { canonical: `/${locale}/pricing` },
  };
}

/**
 * Tutor pricing - a marketing surface, so it uses the editorial register for the
 * band and the calm product register for the plan cards themselves.
 */
export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  const t = createTranslator(locale);
  const [plans, settings, launchOffer] = await Promise.all([
    listPlans(locale),
    getSettings(),
    getLaunchOfferStatus(),
  ]);
  // The commission is interpolated everywhere it is stated, so the copy cannot
  // drift from the number the platform actually charges (settings.commissionPercent).
  const percent = settings.commissionPercent;
  const tutorShare = 100 - percent;
  const waDigits = settings.whatsappNumber.replace(/[^\d]/g, "");
  const faqs = [1, 2, 3] as const;

  return (
    <>
      <section className="band">
        <div className="band__scrim" aria-hidden="true" />
        <div className="shell band__inner">
          <span className="kicker kicker--onDark tracked" data-reveal>
            {t("nav.becomeTutor")}
          </span>
          <h1 className="display display--section display--onDark">
            {locale === "ar" ? (
              <>
                <span data-reveal style={{ "--reveal-i": 1, display: "block" } as React.CSSProperties}>
                  أسعار واضحة
                </span>
                <span className="display__em" data-reveal style={{ "--reveal-i": 2, display: "block" } as React.CSSProperties}>
                  بلا أي مفاجآت
                </span>
              </>
            ) : (
              <>
                <span data-reveal style={{ "--reveal-i": 1, display: "block" } as React.CSSProperties}>
                  Clear pricing.
                </span>
                <span className="display__em" data-reveal style={{ "--reveal-i": 2, display: "block" } as React.CSSProperties}>
                  Nothing hidden.
                </span>
              </>
            )}
          </h1>
          <p className="lead" style={{ color: "rgba(226,236,255,.88)" }} data-reveal>
            {t("pricing.lead")}
          </p>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          {plans.some((plan) => plan.isDemo) ? (
            <p className="notice notice--warn" style={{ marginBlockEnd: "1.25rem" }}>
              {t("misc.demoData")}
            </p>
          ) : null}

          <div className="grid grid--2">
            {plans.map((plan) => (
              <article className="card plan" key={plan.id} data-reveal>
                <header className="row row--between">
                  <strong style={{ fontSize: "1.1rem" }}>{plan.name}</strong>
                  <span className="chip chip--pale">
                    {t(plan.interval === "monthly" ? "pricing.monthly" : "pricing.annual")}
                  </span>
                </header>
                <p className="plan__price tnum">{formatMoney(plan.price, locale)}</p>
                <p className="field__hint">
                  {plan.durationDays} {locale === "ar" ? "يومًا" : "days"} · {plan.graceDays}{" "}
                  {locale === "ar" ? "أيام مهلة" : "days grace"}
                </p>
                <ul className="plan__features">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <Link className="btn btn--primary" href={`/${locale}/register`}>
                  {t("pricing.cta")}
                </Link>
              </article>
            ))}
          </div>

          {launchOffer.active ? (
            <article
              className="card card--accent stack-xs"
              style={{ marginBlockStart: "1.5rem" }}
            >
              <div className="row row--between" style={{ alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <h2 style={{ fontSize: "1.05rem", margin: 0 }}>{t("pricing.launch.title")}</h2>
                <span className="chip chip--on">{t("pricing.launch.remaining", { remaining: launchOffer.remaining, limit: launchOffer.limit })}</span>
              </div>
              <p className="soft">{t("pricing.launch.body", { limit: launchOffer.limit })}</p>
              <div className="row">
                <Link className="btn btn--primary btn--sm" href={`/${locale}/register`}>
                  {t("pricing.launch.claim")}
                </Link>
              </div>
            </article>
          ) : launchOffer.enabled ? (
            <p className="notice notice--info" style={{ marginBlockStart: "1.5rem" }}>
              {t("pricing.launch.full")}
            </p>
          ) : null}

          <div className="card stack-xs" style={{ marginBlockStart: "1.5rem" }}>
            <h2 style={{ fontSize: "1.05rem" }}>{t("payment.title")}</h2>
            <p className="soft">{t("payment.instructionLong")}</p>
            <p className="field__hint">{t("payment.manualNotice")}</p>
            <div className="row">
              <a className="btn btn--outline btn--sm" href={`https://wa.me/${waDigits}`} target="_blank" rel="noopener noreferrer">
                {t("cta.openWhatsapp")}
              </a>
              <Link className="btn btn--quiet btn--sm" href={`/${locale}/legal/tutor-terms`}>
                {t("legal.tutorTerms.title")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Commission. Stated as plainly as the numbers make possible, and read
          from the same setting the platform charges — so the page cannot claim
          one rate while the platform takes another. */}
      <section className="section section--tight">
        <div className="shell">
          <article className="card card--accent stack-xs">
            <h2 style={{ fontSize: "1.05rem" }}>{t("pricing.commission.title")}</h2>
            <p className="soft">
              {t("pricing.commission.body", { percent, tutorShare })}
            </p>
          </article>
        </div>
      </section>

      <section className="section section--pale">
        <div className="shell">
          <div className="section__head">
            <span className="kicker tracked">{t("pricing.faq")}</span>
          </div>
          <div className="faq">
            {faqs.map((n, i) => (
              <details key={n} open={i === 0}>
                <summary>{t(`pricing.faq.q${n}` as never)}</summary>
                <div className="faq__body">{t(`pricing.faq.a${n}` as never, { percent, tutorShare, limit: launchOffer.limit, remaining: launchOffer.remaining })}</div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
