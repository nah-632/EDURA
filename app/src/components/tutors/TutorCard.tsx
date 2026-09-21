import Link from "next/link";

import { createTranslator, formatMoney, type Locale } from "@/lib/i18n";
import type { TutorCardData } from "@/lib/data/tutors";

export interface TutorCardProps {
  locale: Locale;
  tutor: TutorCardData;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] ?? "").join("");
}

/**
 * Tutor card. The whole card is a single link (one tab stop, no nested
 * interactive elements) and the avatar is a real element with a brand fallback
 * instead of a fabricated photograph.
 */
export function TutorCard({ locale, tutor }: TutorCardProps) {
  const t = createTranslator(locale);
  const href = `/${locale}/tutors/${tutor.slug}`;

  return (
    <article className="tcard" data-reveal>
      <div className="tcard__body">
        <div className="tcard__top">
          <span className="tcard__avatar" aria-hidden="true">
            {initials(tutor.name)}
          </span>
          <div className="stack-xs" style={{ flex: 1, minWidth: 0 }}>
            <h3 className="tcard__name">
              <Link href={href} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {tutor.name}
                {tutor.verified ? (
                  <span className="badge-verified" title={t("label.verifiedTutor")}>
                    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path
                        d="M10 1.5l2.2 1.6 2.7-.2.9 2.6 2.2 1.6-1 2.5 1 2.5-2.2 1.6-.9 2.6-2.7-.2L10 18.5l-2.2-1.6-2.7.2-.9-2.6L2 12.9l1-2.5-1-2.5 2.2-1.6.9-2.6 2.7.2L10 1.5z"
                        fill="currentColor"
                        opacity="0.16"
                      />
                      <path
                        d="M6.4 10.2l2.3 2.3 4.8-5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="visually-hidden">{t("label.verifiedTutor")}</span>
                  </span>
                ) : null}
              </Link>
            </h3>
            <p className="tcard__meta">
              {tutor.qualification}
              {tutor.area ? ` · ${tutor.area}` : ""}
            </p>
          </div>
        </div>

        <p style={{ color: "var(--ink-soft)", fontSize: "0.93rem" }}>{tutor.headline}</p>

        <div className="row" style={{ gap: "0.4rem" }}>
          {tutor.subjects.slice(0, 3).map((subject) => (
            <span className="chip chip--pale" key={subject}>
              {subject}
            </span>
          ))}
          <span className="chip">{tutor.teachesHome ? t("tutor.card.home") : t("tutor.card.online")}</span>
        </div>

        <div className="row" style={{ gap: "0.9rem", fontSize: "0.85rem", color: "var(--ink-mute)" }}>
          {tutor.ratingCount > 0 && tutor.ratingAvg ? (
            <span className="row" style={{ gap: "0.3rem" }}>
              <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true" fill="var(--gold)">
                <path d="M10 1.6l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 15l-5.2 2.7 1-5.8L1.5 7.8l5.9-.9L10 1.6z" />
              </svg>
              <strong style={{ color: "var(--deep)" }}>{tutor.ratingAvg}</strong>
              <span>
                ({tutor.ratingCount} {t("label.reviews")})
              </span>
            </span>
          ) : (
            <span>{t("tutor.card.newTutor")}</span>
          )}
          <span>
            {tutor.yearsExperience} {t("label.experience")}
          </span>
        </div>
      </div>

      <div className="tcard__foot">
        <span className="price">
          {formatMoney(tutor.pricePerHour, locale)} <small>{t("tutor.card.perHour")}</small>
        </span>
        <Link className="btn btn--primary btn--sm" href={href} aria-label={`${t("cta.bookLesson")} — ${tutor.name}`}>
          {t("cta.bookLesson")}
        </Link>
      </div>
    </article>
  );
}
