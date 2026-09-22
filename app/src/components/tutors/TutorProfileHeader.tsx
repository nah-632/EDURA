import Link from "next/link";

import { createTranslator, formatMoney, type Locale } from "@/lib/i18n";
import type { DemoTutor } from "@/lib/data/demo";
import type { Option } from "@/lib/data/catalog";

export interface TutorProfileHeaderProps {
  locale: Locale;
  tutor: DemoTutor;
  subjects: Option[];
  photoUrl?: string | null;
}

/**
 * Tutor profile header band - the editorial treatment applied to a profile.
 * Same register as the homepage hero (display serif, kicker, parallax band),
 * and it hands over to the calm product UI as soon as the booking panel starts.
 */
export function TutorProfileHeader({ locale, tutor, subjects, photoUrl = null }: TutorProfileHeaderProps) {
  const t = createTranslator(locale);
  const subjectNameOf = (name: string) => subjects.find((s) => s.name === name || s.code === name)?.name ?? name;

  return (
    <section className="band band--profile">
      {photoUrl ? (
        <div className="band__media" data-parallax>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="" width={2000} height={900} decoding="async" />
        </div>
      ) : null}
      {/* No decorative fallback: a soft gradient bloom behind the name is the
          same generated-site pattern as the hero gradient, and a tutor's own
          photograph is the only thing worth putting here. A solid navy band
          with the name on it is the honest default. */}
      <div className="band__scrim" aria-hidden="true" />

      <div className="shell band__inner">

        <h1 className="display display--section display--onDark">
          <span data-reveal style={{ "--reveal-i": 1 } as React.CSSProperties}>
            {tutor.name}
          </span>
        </h1>

        <p className="lead" style={{ color: "rgba(232, 240, 255, 0.9)", maxWidth: "52ch" }} data-reveal>
          {tutor.headline}
        </p>

        <ul className="profile-meta" data-reveal style={{ "--reveal-i": 2 } as React.CSSProperties}>
          <li>
            <strong>{tutor.ratingAvg ?? "—"}</strong>
            <span>
              {tutor.ratingCount > 0 ? `${tutor.ratingCount} ${t("label.reviews")}` : t("tutor.card.noReviews")}
            </span>
          </li>
          <li>
            <strong>{tutor.completedLessons}</strong>
            <span>{t("label.lessonsCompleted")}</span>
          </li>
          <li>
            <strong>{tutor.yearsExperience}</strong>
            <span>{t("label.experience")}</span>
          </li>
          <li>
            <strong>{tutor.area}</strong>
            <span>{t("label.area")}</span>
          </li>
          <li>
            <strong>{formatMoney(tutor.pricePerHour, locale)}</strong>
            <span>{t("tutor.card.perHour")}</span>
          </li>
        </ul>

        <div className="row" data-reveal style={{ "--reveal-i": 3 } as React.CSSProperties}>
          <Link className="btn btn--lg btn--onPhoto" href={`/${locale}/tutors/${tutor.slug}/book`}>
            {t("profile.bookCta")}
          </Link>
          <Link className="btn btn--lg btn--ghostOnPhoto" href={`/${locale}/contact`}>
            {t("profile.contactCta")}
          </Link>
        </div>

        <div className="row" style={{ gap: "0.4rem" }} data-reveal>
          {tutor.subjects.map((subject) => (
            <span className="chip chip--onDark" key={subject}>
              {subjectNameOf(subject)}
            </span>
          ))}
          <span className="chip chip--onDark">
            {tutor.teachesHome ? t("tutor.card.home") : ""}
            {tutor.teachesHome && tutor.teachesOnline ? " · " : ""}
            {tutor.teachesOnline ? t("tutor.card.online") : ""}
          </span>
        </div>

        {/* Guarantee badge on the profile (addendum §C): the claim is specific
            and checkable - qualification and identity were reviewed by hand
            before this profile could appear. */}
        {tutor.verified ? (
          <p className="field__hint" style={{ color: "rgba(226,236,255,.82)", maxWidth: "60ch" }} data-reveal>
            <span aria-hidden="true">✓ </span>
            {t("profile.guaranteeBadge")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
