import Link from "next/link";

import { createTranslator, type Locale } from "@/lib/i18n";
import { bandPhotoUrl, familyPhotoUrl } from "@/lib/brand/hero-photo";
import type { Option } from "@/lib/data/catalog";

/**
 * The marketing sections of the homepage.
 *
 * Kept in one module on purpose: they are presentation-only, share the same
 * reveal grid, and splitting them into nine files would add navigation cost
 * without adding clarity. Anything with behaviour lives in its own file.
 */

export function Reveal({
  index,
  className,
  children,
  as: Tag = "div",
}: {
  index: number;
  className?: string;
  children: React.ReactNode;
  as?: "div" | "li" | "h3" | "p";
}) {
  return (
    <Tag className={className} data-reveal style={{ "--reveal-i": index } as React.CSSProperties}>
      {children}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
export function HowItWorks({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);
  const steps = [1, 2, 3, 4] as const;

  return (
    <section className="section" id="how">
      <div className="shell how__grid">
        <div className="how__copy">
          <div className="section__head">
            <h2 className="display display--section">{t("home.how.subtitle")}</h2>
          </div>
          <ol className="how__steps">
            {steps.map((step, i) => (
              <Reveal key={step} index={i} as="li" className="step">
                <span className="step__n" aria-hidden="true">
                  {String(step).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="step__title">{t(`home.how.step${step}.title` as never)}</h3>
                  <p className="step__body">{t(`home.how.step${step}.body` as never)}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>

        {/* Booking a tutor happens at home, with a parent in the room. The
            photograph says that faster than another paragraph would. */}
        <figure className="how__figure" data-reveal>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={familyPhotoUrl()}
            alt=""
            width={1100}
            height={614}
            loading="lazy"
            decoding="async"
          />
        </figure>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
export function SubjectGrid({ locale, subjects }: { locale: Locale; subjects: Option[] }) {
  const t = createTranslator(locale);
  // A tile per subject inside identical white cards, so the differentiation the
  // brief asks for has to come from the tile: a distinct glyph (below) and a
  // tint drawn from the brand palette. Five tints, not ten — a rainbow would
  // read as decoration.
  const TINTS: Record<string, "terracotta" | "sand" | "navy" | "teal" | "gold"> = {
    math: "navy",
    arabic: "terracotta",
    english: "teal",
    science: "sand",
    physics: "navy",
    chemistry: "terracotta",
    biology: "teal",
    social: "gold",
    cs: "navy",
    islamic: "sand",
  };
  const subjectTint = (code: string): React.CSSProperties => {
    const tint = TINTS[code] ?? "sand";
    return {
      "--subject-tint": `var(--tint-${tint})`,
      "--subject-ink": `var(--tint-${tint}-ink)`,
    } as React.CSSProperties;
  };

  // One glyph per subject code in the reference data (drizzle/0001). Every
  // subject a visitor can click has to say what it is at a glance; falling
  // back to a notebook for eight of ten tiles made the grid read as broken.
  // All 24x24, stroke-only, drawn on the same grid as the rest of the icon set.
  const icons: Record<string, React.ReactNode> = {
    math: <path d="M4 6h6M7 3v6M13 6l6 6M19 6l-6 6M4 16h6M4 20h6M14 17h6M17 14v6" />,
    arabic: (
      <>
        <path d="M12 6.8C10.4 5.2 8.3 4.5 5.6 4.5c-.9 0-1.6.2-1.6.6v10.6c0 .4.7.6 1.6.6 2.7 0 4.8.7 6.4 2.2" />
        <path d="M12 6.8c1.6-1.6 3.7-2.3 6.4-2.3.9 0 1.6.2 1.6.6v10.6c0 .4-.7.6-1.6.6-2.7 0-4.8.7-6.4 2.2" />
        <path d="M12 6.8v11.7" />
      </>
    ),
    english: (
      <>
        <circle cx="12" cy="12" r="8.2" />
        <path d="M3.8 12h16.4" />
        <path d="M12 3.8c2.6 2.6 2.6 13.8 0 16.4M12 3.8c-2.6 2.6-2.6 13.8 0 16.4" />
      </>
    ),
    science: (
      <>
        <path d="M9.5 3.5h5M10.5 3.5v5.9L6.2 17.3A2 2 0 007.9 20.3h8.2a2 2 0 001.7-3L13.5 9.4V3.5" />
        <path d="M8.2 14.4h7.6" />
      </>
    ),
    physics: (
      <>
        <circle cx="12" cy="12" r="1.7" />
        <ellipse cx="12" cy="12" rx="9" ry="3.7" />
        <ellipse cx="12" cy="12" rx="9" ry="3.7" transform="rotate(60 12 12)" />
      </>
    ),
    chemistry: (
      <>
        <path d="M6.5 4h11v13.2a3 3 0 01-3 3h-5a3 3 0 01-3-3V4z" />
        <path d="M6.5 13.4h11" />
        <circle cx="10" cy="9.4" r=".9" />
        <circle cx="14" cy="7.4" r=".9" />
      </>
    ),
    biology: (
      <>
        <path d="M20 4.2c.6 7.5-3.6 13.4-10.6 14.9" />
        <path d="M9.4 19.1C6.7 17.6 5 15.2 5 12.2 5 7.4 9.2 4 15.4 4c-1.2 8.3-3.3 12.6-6 15.1z" />
      </>
    ),
    social: (
      <>
        <circle cx="9" cy="8.4" r="3.1" />
        <path d="M3.4 19.4c0-3.1 2.5-5.4 5.6-5.4s5.6 2.3 5.6 5.4" />
        <path d="M16.2 5.7a3.1 3.1 0 010 5.9M17.6 14.4c1.9.6 3.2 2.4 3.2 4.6" />
      </>
    ),
    cs: <path d="M9 7.5L4.8 12 9 16.5M15 7.5L19.2 12 15 16.5M13.4 5.4l-2.8 13.2" />,
    islamic: (
      <>
        <path d="M4.5 20.4v-6.1a7.5 7.5 0 0115 0v6.1z" />
        <path d="M12 6.8V4.4" />
        <circle cx="12" cy="3.1" r="1.1" />
      </>
    ),
    default: (
      <>
        <path d="M4 5.4h11a3 3 0 013 3v10.2H7a3 3 0 01-3-3V5.4z" />
        <path d="M4 5.4v10.2a3 3 0 003 3" />
        <path d="M8.4 9.6h6" />
      </>
    ),
  };

  return (
    <section className="section section--tight" id="subjects">
      <div className="shell">
        <div className="section__head">
          <h2 className="display display--section">{t("home.subjects.subtitle")}</h2>
        </div>
        <ul className="subject-grid">
          {subjects.slice(0, 10).map((subject, i) => (
            <Reveal as="li" key={subject.id} index={i % 5}>
              <Link className="subject" href={`/${locale}/tutors?subject=${subject.code}`}>
                <span
                  className="subject__icon"
                  aria-hidden="true"
                  style={subjectTint(subject.code)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                    {icons[subject.code] ?? icons.default}
                  </svg>
                </span>
                <span>{subject.name}</span>
              </Link>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
export function StageStrip({ locale, stages }: { locale: Locale; stages: Option[] }) {
  const t = createTranslator(locale);
  return (
    <section className="section section--tight">
      <div className="shell">
        <div className="section__head">
          <h2 className="display display--section">{t("home.stages.subtitle")}</h2>
        </div>
        <div className="stage-strip">
          {stages.map((stage, i) => (
            <Reveal key={stage.id} index={i} className="stage">
              <Link href={`/${locale}/tutors?stage=${stage.code}`}>
                <strong>{stage.name}</strong>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
export function Highlights({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);
  const items = ["home", "online", "exam", "intensive"] as const;
  const icons: Record<string, string> = {
    home: "M4 10.5L12 4l8 6.5V20H4v-9.5z",
    online: "M3 6h18v10H3zM8 20h8",
    exam: "M6 3h9l4 4v14H6zM9 12h6M9 16h4",
    intensive: "M12 3v6l4 2-4 2v6l-4-2V3z",
  };

  return (
    <section className="section">
      <div className="shell">
        <div className="section__head">
        </div>
        <div className="grid grid--4">
          {items.map((item, i) => (
            <Reveal key={item} index={i} className="card feature">
              <span className="feature__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d={icons[item]!} />
                </svg>
              </span>
              <h3 style={{ fontSize: "1.05rem" }}>{t(`home.highlights.${item}.title` as never)}</h3>
              <p style={{ color: "var(--ink-soft)", fontSize: "0.94rem" }}>{t(`home.highlights.${item}.body` as never)}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
export function WhyEdura({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);
  const points = [1, 2, 3, 4] as const;

  return (
    <section className="section section--pale">
      <div className="shell">
        <div className="section__head">
          <h2 className="display display--section">{t("brand.tagline")}</h2>
        </div>
        <div className="grid grid--2">
          {points.map((point, i) => (
            <Reveal key={point} index={i} className="card card--accent">
              <h3 style={{ fontSize: "1.08rem", marginBlockEnd: "0.4rem" }}>
                {t(`home.why.point${point}.title` as never)}
              </h3>
              <p style={{ color: "var(--ink-soft)" }}>{t(`home.why.point${point}.body` as never)}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
export function SafetySection({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);
  return (
    <section className="section">
      <div className="shell">
        <div className="card" style={{ display: "grid", gap: "1rem" }}>
          <h2 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
            {t("legal.safety.s1")}
          </h2>
          <p className="soft" style={{ maxWidth: "70ch" }}>
            {t("home.safety.body")}
          </p>
          <div className="row">
            <Link className="btn btn--outline btn--sm" href={`/${locale}/legal/safety`}>
              {t("home.safety.link")}
            </Link>
            <Link className="btn btn--quiet btn--sm" href={`/${locale}/legal/privacy`}>
              {t("legal.privacy.title")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
/**
 * About teaser (addendum §A/§D).
 *
 * The homepage already says "Proudly Bahraini" in the hero; this section is
 * where that badge acquires substance - the two sides the platform serves -
 * and hands over to the full About page.
 */
export function AboutTeaser({
  locale,
  body,
  familyLine,
  tutorLine,
  percent,
}: {
  locale: Locale;
  body?: string;
  familyLine?: string;
  tutorLine?: string;
  /** Platform commission, read from settings so the copy never drifts. */
  percent?: number;
}) {
  const t = createTranslator(locale);
  const fallbackTutorLine = t("home.about.tutors", percent === undefined ? undefined : { percent });
  return (
    <section className="section" id="about">
      <div className="shell">
        <div className="section__head">
          <h2 className="display display--section">{t("home.about.title")}</h2>
        </div>
        <div className="grid grid--2">
          <Reveal index={0} className="card card--accent">
            <p className="soft">{(body ?? t("home.about.body")).trim()}</p>
          </Reveal>
          <div className="stack-sm">
            <Reveal index={1} className="card">
              <p className="soft">{(familyLine ?? t("home.about.families")).trim()}</p>
            </Reveal>
            <Reveal index={2} className="card">
              <p className="soft">{(tutorLine ?? fallbackTutorLine).trim()}</p>
            </Reveal>
            <div className="row">
              <Link className="btn btn--outline btn--sm" href={`/${locale}/about`}>
                {t("home.about.link")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
/**
 * Guarantee trust badges (addendum §C/§D).
 *
 * The three claims are the ones the platform can actually back: hand
 * verification before listing, no confirmation before a verified payment, and
 * the configurable replacement window. `hours` comes from platform settings, so
 * the badge can never advertise a window the claim rule does not honour.
 */
export function GuaranteeBadges({ locale, hours }: { locale: Locale; hours: number }) {
  const t = createTranslator(locale);
  const badges = [
    { icon: "M9 12l2 2 4-4M12 3l7 3v6c0 4.5-3 7.4-7 9-4-1.6-7-4.5-7-9V6l7-3z", label: t("guarantee.badge.verified") },
    { icon: "M3 7h18v10H3zM8 12h8", label: t("guarantee.badge.payment") },
    { icon: "M4 5h11l5 5v9H4zM9 13h6M12 10v6", label: t("guarantee.badge.replacement", { hours }) },
  ];

  return (
    <section className="section section--tight">
      <div className="shell">
        <div className="section__head">
          <h2 className="display display--section">{t("home.guarantee.title")}</h2>
          <p className="lead" style={{ maxWidth: "62ch" }}>
            {t("home.guarantee.body")}
          </p>
        </div>
        <div className="grid grid--3">
          {badges.map((badge, i) => (
            <Reveal key={badge.label} index={i} className="card feature">
              <span className="feature__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d={badge.icon} />
                </svg>
              </span>
              <p className="soft">{badge.label}</p>
            </Reveal>
          ))}
        </div>
        <div className="row">
          <Link className="btn btn--quiet btn--sm" href={`/${locale}/legal/guarantee`}>
            {t("home.guarantee.link")}
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
export function FaqSection({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);
  const items = [1, 2, 3, 4, 5] as const;

  return (
    <section className="section" id="faq">
      <div className="shell">
        <div className="section__head">
        </div>
        <div className="faq">
          {items.map((item, i) => (
            <Reveal key={item} index={0}>
              <details open={i === 0}>
                <summary>{t(`home.faq.q${item}` as never)}</summary>
                <div className="faq__body">{t(`home.faq.a${item}` as never)}</div>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
export function BecomeTutorBand({
  locale,
  photoUrl = bandPhotoUrl(),
}: {
  locale: Locale;
  photoUrl?: string | null;
}) {
  const t = createTranslator(locale);
  return (
    <section className="band">
      {photoUrl ? (
        <div className="band__media" data-parallax>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="" width={2000} height={1125} loading="lazy" decoding="async" />
        </div>
      ) : null}
      <div className="band__scrim" aria-hidden="true" />
      <div className="shell band__inner">
        <h2 className="display display--section display--onDark">
          <span data-reveal style={{ "--reveal-i": 0 } as React.CSSProperties}>
            {t("home.becomeTutor.point1")}
          </span>
        </h2>
        <p
          className="lead"
          style={{ color: "rgba(226,236,255,.86)", maxWidth: "52ch" }}
          data-reveal
        >
          {t("home.becomeTutor.body")}
        </p>
        <ul className="band__list">
          {[t("home.becomeTutor.point2"), t("home.becomeTutor.point3"), t("tutor.join.note")].map((line, i) => (
            <li key={line} data-reveal style={{ "--reveal-i": i + 1 } as React.CSSProperties}>
              {line}
            </li>
          ))}
        </ul>
        <div className="row" data-reveal style={{ "--reveal-i": 4 } as React.CSSProperties}>
          <Link className="btn btn--lg btn--onPhoto" href={`/${locale}/pricing`}>
            {t("cta.becomeTutor")}
          </Link>
          <Link className="btn btn--lg btn--ghostOnPhoto" href={`/${locale}/how`}>
            {t("nav.how")}
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
export function FinalCta({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);
  return (
    <section className="section">
      <div className="shell">
        <div className="cta-band">
          <h2 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
            {t("home.cta.title")}
          </h2>
          <p style={{ color: "var(--ink-soft)", maxWidth: "56ch" }}>{t("home.cta.body")}</p>
          <div className="row">
            <Link className="btn btn--lg btn--primary" href={`/${locale}/tutors`}>
              {t("cta.searchTutor")}
            </Link>
            <Link className="btn btn--lg btn--outline" href={`/${locale}/contact`}>
              {t("cta.contactUs")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
