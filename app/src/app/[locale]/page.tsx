import Link from "next/link";

import { Hero } from "@/components/home/Hero";
import { EmptyState } from "@/components/ui/EmptyState";
import { WhyEdura } from "@/components/home/WhyEdura";
import {
  AboutTeaser,
  BecomeTutorBand,
  FaqSection,
  FinalCta,
  GuaranteeBadges,
  Highlights,
  HowItWorks,
  StageStrip,
  SubjectGrid,
} from "@/components/home/Sections";
import { TutorCard } from "@/components/tutors/TutorCard";
import { createTranslator, type Locale } from "@/lib/i18n";
import { bandPhotoUrl, heroPhotoUrl } from "@/lib/brand/hero-photo";
import { cmsText, readCmsContent } from "@/lib/cms/public";
import { listAreas, listStages, listSubjects } from "@/lib/data/catalog";
import { listPublicTutors } from "@/lib/data/tutors";
import { guaranteeSummary } from "@/lib/guarantee/rules";
import { getGuaranteeConfig } from "@/lib/settings";
import { faqJsonLd, organisationJsonLd } from "@/lib/security/jsonld";

// Public marketing page: cacheable, and live tutor availability rides the
// booking flow rather than the homepage.
export const revalidate = 30;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  const t = createTranslator(locale);

  const [subjects, stages, areas, featured, cms, guarantee] = await Promise.all([
    listSubjects(locale),
    listStages(locale),
    listAreas(locale),
    listPublicTutors(locale, { sort: "rating", limit: 3 }),
    readCmsContent(),
    getGuaranteeConfig(),
  ]);
  const guaranteeNumbers = guaranteeSummary(guarantee);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://edura.world";
  const faq = [1, 2, 3, 4, 5].map((i) => ({
    question: t(`home.faq.q${i}` as never),
    answer: t(`home.faq.a${i}` as never),
  }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: organisationJsonLd({
            name: t("brand.name"),
            url: `${siteUrl}/${locale}`,
            logo: `${siteUrl}/brand/assets/favicon/favicon-192.png`,
            description: t("brand.metaDescription"),
          }),
        }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd(faq) }} />

      <Hero
        locale={locale}
        subjects={subjects}
        stages={stages}
        areas={areas}
        photoUrl={heroPhotoUrl()}
      />

      <HowItWorks locale={locale} />

      <section className="section" id="tutors">
        <div className="shell">
          <div className="section__head row--between" style={{ display: "flex", alignItems: "flex-end", gap: "1rem", flexWrap: "wrap", maxWidth: "none" }}>
            <div className="stack-xs">
              <h2 className="display display--section">{t("home.featured.subtitle")}</h2>
            </div>
            <Link className="btn btn--outline btn--sm" href={`/${locale}/tutors`}>
              {t("cta.seeAll")}
            </Link>
          </div>

          {featured.length === 0 ? (
            <div data-reveal>
              <EmptyState
                title={t("state.emptyTitle")}
                body={t("home.featured.empty")}
                action={{ href: `/${locale}/tutors`, label: t("cta.seeAll") }}
              />
            </div>
          ) : (
            <div className="grid grid--3">
              {featured.map((tutor) => (
                <TutorCard key={tutor.id} locale={locale} tutor={tutor} />
              ))}
            </div>
          )}
        </div>
      </section>

      <SubjectGrid locale={locale} subjects={subjects} />
      <StageStrip locale={locale} stages={stages} />
      <Highlights locale={locale} />
      <WhyEdura locale={locale} />
      <GuaranteeBadges locale={locale} hours={guaranteeNumbers.claimWindowHours} />
      <SafetySection locale={locale} />
      <AboutTeaser
        locale={locale}
        body={cmsText(cms, "aboutIntro", locale, t("home.about.body"))}
        familyLine={cmsText(cms, "aboutFamilies", locale, t("home.about.families"))}
        tutorLine={cmsText(cms, "aboutTutors", locale, t("home.about.tutors"))}
      />
      <FaqSection locale={locale} />
      <BecomeTutorBand locale={locale} photoUrl={bandPhotoUrl()} />
      <FinalCta locale={locale} />
    </>
  );
}
