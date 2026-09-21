import Link from "next/link";

import { createTranslator, type Locale } from "@/lib/i18n";
import { EduraMark } from "@/components/brand/EduraLogo";
import { HeroSearch } from "./HeroSearch";
import type { Option } from "@/lib/data/catalog";

export interface HeroProps {
  locale: Locale;
  subjects: Option[];
  stages: Option[];
  areas: Option[];
  /** real photography if supplied, otherwise the designed fallback */
  photoUrl?: string | null;
}

export function Hero({ locale, subjects, stages, areas, photoUrl = null }: HeroProps) {
  const t = createTranslator(locale);

  return (
    <section className="hero">
      {/* Background: a real photograph when one exists, otherwise a warm
          "afternoon light" composition built from the brand palette. */}
      {photoUrl ? (
        <div className="hero__media" data-parallax>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="" width={2400} height={1350} fetchPriority="high" decoding="async" />
        </div>
      ) : (
        <div className="hero__media hero__media--designed" data-parallax aria-hidden="true">
          <span className="hero__glow" />
          <span className="hero__waves" />
          <span className="hero__mark">
            <EduraMark height={420} variant="mono" />
          </span>
        </div>
      )}

      <div className="hero__scrim" aria-hidden="true" />

      <div className="shell hero__inner">
        {/* §4.1: the Bahraini-pride badge is a first-class hero element, not a
            footer disclaimer. */}
        <span className="kicker kicker--onDark tracked hero__kicker" data-reveal style={{ "--reveal-i": 0 } as React.CSSProperties}>
          {t("brand.proudlyBahraini")}
        </span>

        <h1 className="display display--hero display--onDark hero__title">
          {locale === "ar" ? (
            <>
              <span data-reveal style={{ "--reveal-i": 1, display: "block" } as React.CSSProperties}>
                مدرسك المناسب…
              </span>
              <span className="display__em" data-reveal style={{ "--reveal-i": 2, display: "block" } as React.CSSProperties}>
                في الوقت والمكان المناسب
              </span>
            </>
          ) : (
            <>
              <span data-reveal style={{ "--reveal-i": 1, display: "block" } as React.CSSProperties}>
                The right tutor.
              </span>
              <span className="display__em" data-reveal style={{ "--reveal-i": 2, display: "block" } as React.CSSProperties}>
                A brighter future.
              </span>
            </>
          )}
        </h1>

        <p className="lead hero__lead" data-reveal style={{ "--reveal-i": 3 } as React.CSSProperties}>
          {t("brand.statement")}
        </p>

        <div className="hero__actions" data-reveal style={{ "--reveal-i": 4 } as React.CSSProperties}>
          <Link className="btn btn--lg btn--onPhoto" href={`/${locale}/tutors`}>
            {t("cta.searchTutor")}
          </Link>
          <Link className="btn btn--lg btn--ghostOnPhoto" href={`/${locale}/pricing`}>
            {t("cta.becomeTutor")}
            <span className="btn__arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>

        <ul className="hero__trust" data-reveal style={{ "--reveal-i": 5 } as React.CSSProperties}>
          {[t("home.hero.trust1"), t("home.hero.trust2"), t("home.hero.trust3")].map((label) => (
            <li key={label} style={{ listStyle: "none", display: "inline-flex", alignItems: "center", gap: "0.45rem" }}>
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {label}
            </li>
          ))}
        </ul>
      </div>

      <HeroSearch
        action={`/${locale}/tutors`}
        subjects={subjects}
        stages={stages}
        areas={areas}
        labels={{
          subject: t("home.search.subjectLabel"),
          stage: t("home.search.stageLabel"),
          area: t("home.search.areaLabel"),
          subjectPlaceholder: t("home.search.subjectPlaceholder"),
          stagePlaceholder: t("home.search.stagePlaceholder"),
          areaPlaceholder: t("home.search.areaPlaceholder"),
          submit: t("cta.search"),
        }}
      />
    </section>
  );
}
