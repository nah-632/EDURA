import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TutorProfileHeader } from "@/components/tutors/TutorProfileHeader";
import { BookingPanelEntry } from "@/components/booking/BookingPanelEntry";
import { createTranslator, formatMoney, type Locale } from "@/lib/i18n";
import { listSubjects } from "@/lib/data/catalog";
import { getPublicTutor, getTutorAvailability } from "@/lib/data/tutors";
import { breadcrumbJsonLd, tutorJsonLd } from "@/lib/security/jsonld";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const typed = locale as Locale;
  const tutor = await getPublicTutor(typed, slug);
  if (!tutor) return { title: createTranslator(typed)("profile.notFound") };
  return {
    title: `${tutor.name} — ${tutor.headline}`,
    description: tutor.bio.slice(0, 155),
    alternates: { canonical: `/${locale}/tutors/${slug}` },
    openGraph: { type: "profile", title: tutor.name, description: tutor.headline },
  };
}

export default async function TutorProfilePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: rawLocale, slug } = await params;
  const locale = rawLocale as Locale;
  const t = createTranslator(locale);

  const tutor = await getPublicTutor(locale, slug);
  if (!tutor) notFound();

  const [subjects, availability] = await Promise.all([listSubjects(locale), getTutorAvailability(tutor.id)]);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const weekdayNames = [0, 1, 2, 3, 4, 5, 6].map((day) => t(`profile.weekday.${day}` as never));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: tutorJsonLd({
            name: tutor.name,
            headline: tutor.headline,
            bio: tutor.bio,
            area: tutor.area,
            ratingAvg: tutor.ratingAvg,
            ratingCount: tutor.ratingCount,
            pricePerHour: tutor.pricePerHour,
            currency: "BHD",
            url: `${siteUrl}/${locale}/tutors/${tutor.slug}`,
            subjects: tutor.subjects,
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: breadcrumbJsonLd([
            { name: t("nav.home"), url: `${siteUrl}/${locale}` },
            { name: t("nav.tutors"), url: `${siteUrl}/${locale}/tutors` },
            { name: tutor.name, url: `${siteUrl}/${locale}/tutors/${tutor.slug}` },
          ]),
        }}
      />

      <TutorProfileHeader locale={locale} tutor={tutor} subjects={subjects} />

      <section className="section">
        <div className="shell profile-layout">
          <div className="stack">
            <div className="card stack-sm">
              <h2 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
                {t("profile.about")}
              </h2>
              <p className="soft" style={{ whiteSpace: "pre-line" }}>
                {tutor.bio}
              </p>
            </div>

            <div className="grid grid--2">
              <div className="card stack-xs">
                <h3 style={{ fontSize: "1rem" }}>{t("profile.qualification")}</h3>
                <p className="soft">{tutor.qualification || "—"}</p>
              </div>
              <div className="card stack-xs">
                <h3 style={{ fontSize: "1rem" }}>{t("profile.teachesSubjects")}</h3>
                <div className="row" style={{ gap: "0.4rem" }}>
                  {tutor.subjects.map((s) => (
                    <span className="chip chip--pale" key={s}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div className="card stack-xs">
                <h3 style={{ fontSize: "1rem" }}>{t("profile.stagesTaught")}</h3>
                <div className="row" style={{ gap: "0.4rem" }}>
                  {tutor.stages.map((s) => (
                    <span className="chip" key={s}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div className="card stack-xs">
                <h3 style={{ fontSize: "1rem" }}>{t("profile.languages")}</h3>
                <p className="soft">{tutor.languages.join(" · ") || "—"}</p>
              </div>
            </div>

            <div className="card stack-sm">
              <h2 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
                {t("profile.availability")}
              </h2>
              {availability.length === 0 ? (
                <p className="soft">{t("state.emptyBody")}</p>
              ) : (
                <div className="avail-grid">
                  {weekdayNames.map((name, day) => {
                    const slots = availability.filter((a) => a.weekday === day);
                    return (
                      <div key={name} className="avail-day">
                        <strong>{name}</strong>
                        {slots.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          slots.map((slot) => (
                            <span key={`${slot.startTime}-${slot.endTime}`} className="tnum">
                              {slot.startTime}–{slot.endTime}
                            </span>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card stack-sm">
              <div className="row row--between">
                <h2 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
                  {t("profile.reviews")}
                </h2>
                <span className="chip">
                  {tutor.ratingAvg ? `${tutor.ratingAvg} / 5` : t("tutor.card.noReviews")}
                </span>
              </div>
              <p className="soft">{t("profile.reviewsEmpty")}</p>
            </div>
          </div>

          <aside className="profile-aside">
            <BookingPanelEntry
              locale={locale}
              tutor={{
                id: tutor.id,
                slug: tutor.slug,
                name: tutor.name,
                pricePerHour: tutor.pricePerHour,
                teachesHome: tutor.teachesHome,
                teachesOnline: tutor.teachesOnline,
              }}
              subjects={tutor.subjects.map((name) => ({ id: name, code: name, name }))}
              labels={{
                title: t("booking.title"),
                price: t("booking.price.perHour"),
                perHour: t("tutor.card.perHour"),
                home: t("search.method.home"),
                online: t("search.method.online"),
                book: t("profile.bookCta"),
                note: t("payment.manualNotice"),
                durationNote: t("booking.price.calculated"),
                duration: t("label.duration"),
                subject: t("booking.subject.select"),
                methodLabel: t("booking.method.select"),
                total: t("booking.price.total"),
                minutes: t("label.minutes"),
              }}
              money={{ hourly: formatMoney(tutor.pricePerHour, locale) }}
            />
          </aside>
        </div>
      </section>
    </>
  );
}
