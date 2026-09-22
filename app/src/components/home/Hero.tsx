import Link from "next/link";

import { createTranslator, type Locale } from "@/lib/i18n";
import { HeroSearch } from "./HeroSearch";
import type { Option } from "@/lib/data/catalog";

export interface HeroProps {
  locale: Locale;
  subjects: Option[];
  stages: Option[];
  areas: Option[];
  /** override the hero photograph (used by the static preview harness) */
  photoUrl?: string | null;
}

/**
 * Homepage hero.
 *
 * Revision 2026-09-22. What changed and why:
 *
 *  - the dark teal gradient with a wavy line pattern behind it is gone. It is
 *    the single most recognisable generated-site hero, and it also fought the
 *    photography. The page is now warm and light, which is what the brand's own
 *    paper stock looks like.
 *  - the headline is ONE weight and ONE colour. The italic light-blue second
 *    line was a formulaic way of emphasising half a sentence; a headline that
 *    needs decoration to carry is not carrying.
 *  - the tracked all-caps eyebrow above it is gone. The Bahraini-identity line
 *    is still here — §5 of the brief requires it in the hero — but as ordinary
 *    text rather than a label with a rule in front of it.
 *  - no arrows on the buttons.
 *
 * The structure is unchanged: same search form, same links, same trust chips.
 */
export function Hero({ locale, subjects, stages, areas, photoUrl = null }: HeroProps) {
  const t = createTranslator(locale);
  const photo = photoUrl ?? "/brand/photo/hero-desk.jpg";

  return (
    <section className="hero">
      <div className="shell hero__grid">
        <div className="hero__copy">
          <p className="hero__identity" data-reveal style={{ "--reveal-i": 0 } as React.CSSProperties}>
            {t("brand.proudlyBahraini")}
          </p>

          <h1 className="display display--hero hero__title" data-reveal style={{ "--reveal-i": 1 } as React.CSSProperties}>
            {locale === "ar" ? (
              <>
                <span style={{ display: "block" }}>مدرسك المناسب…</span>
                <span style={{ display: "block" }}>في الوقت والمكان المناسب</span>
              </>
            ) : (
              <>
                <span style={{ display: "block" }}>The right tutor.</span>
                <span style={{ display: "block" }}>At the right time.</span>
              </>
            )}
          </h1>

          <p className="lead hero__lead" data-reveal style={{ "--reveal-i": 2 } as React.CSSProperties}>
            {t("brand.statement")}
          </p>

          <div className="hero__actions" data-reveal style={{ "--reveal-i": 3 } as React.CSSProperties}>
            <Link className="btn btn--lg btn--primary" href={`/${locale}/tutors`}>
              {t("cta.searchTutor")}
            </Link>
            <Link className="btn btn--lg btn--outline" href={`/${locale}/pricing`}>
              {t("cta.becomeTutor")}
            </Link>
          </div>

          <ul className="hero__trust" data-reveal style={{ "--reveal-i": 4 } as React.CSSProperties}>
            {[t("home.hero.trust1"), t("home.hero.trust2"), t("home.hero.trust3")].map((label) => (
              <li key={label}>
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <figure className="hero__figure" data-reveal style={{ "--reveal-i": 2 } as React.CSSProperties}>
          {/* The photograph carries no baked-in headline: the supplied artwork
              had the logo and tagline printed into its left third, which would
              have put two taglines in one viewport. That panel is cropped off
              (scripts/prepare_photos.py) and the live logo does that job. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo}
            alt=""
            width={895}
            height={768}
            fetchPriority="high"
            decoding="async"
          />
        </figure>
      </div>

      {/* HeroSearch renders its own `.shell hero__search` wrapper — do not add
          another, it would double the gutter. */}
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
