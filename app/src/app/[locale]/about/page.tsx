import type { Metadata } from "next";
import Link from "next/link";

import { createTranslator, type Locale } from "@/lib/i18n";
import { cmsText, readCmsContent } from "@/lib/cms/public";
import { getSettings } from "@/lib/settings";

export const revalidate = 300;

/**
 * About (من نحن) — addendum §A.
 *
 * The platform serves two sides at once: families looking for a tutor they can
 * trust, and Bahraini education specialists looking for real income. The page
 * is therefore built as two equal halves rather than a "mission" paragraph plus
 * feature bullets, and every claim in it is a description of something the
 * product actually does (hand verification, published pricing, admin-verified
 * payment, separate handling of minor data).
 *
 * The opening, the two halves and the closing line are CMS-editable; the
 * dictionary supplies the reviewed default so the page is never empty.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator(locale as Locale);
  return {
    title: t("about.kicker"),
    description: t("about.intro"),
    alternates: { canonical: `/${locale}/about`, languages: { ar: "/ar/about", en: "/en/about" } },
  };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  const t = createTranslator(locale);
  const [cms, settings] = await Promise.all([readCmsContent(), getSettings()]);

  const intro = cmsText(cms, "aboutIntro", locale, t("about.intro"));
  const families = cmsText(cms, "aboutFamilies", locale, t("about.families.lead"));
  const tutors = cmsText(cms, "aboutTutors", locale, t("about.tutors.lead"));
  const closing = cmsText(cms, "aboutClosing", locale, t("about.closing"));

  const familyPoints = ["about.families.p1", "about.families.p2", "about.families.p3", "about.families.p4"] as const;
  const tutorPoints = ["about.tutors.p1", "about.tutors.p2", "about.tutors.p3", "about.tutors.p4"] as const;
  // The commission is interpolated everywhere it is stated, so the copy cannot
  // drift from the number the platform actually charges (settings.commissionPercent).
  const percent = settings.commissionPercent;

  return (
    <section className="section">
      <div className="shell legal-layout">
        <header className="stack-sm">
          <h1 className="display display--section">{t("about.title")}</h1>
          <p className="chip chip--gold">{t("about.badge")}</p>
          <p className="lead">{intro}</p>
        </header>

        <div className="grid grid--2">
          <article className="card card--accent stack-xs">
            <p className="soft">{families}</p>
            <ul className="stack-xs" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {familyPoints.map((key) => (
                <li key={key} className="row" style={{ alignItems: "flex-start", gap: "0.5rem" }}>
                  <span aria-hidden="true" style={{ color: "var(--ok)", lineHeight: 1.5 }}>
                    ✓
                  </span>
                  <span className="soft">{t(key)}</span>
                </li>
              ))}
            </ul>
            <div className="row">
              <Link className="btn btn--primary btn--sm" href={`/${locale}/tutors`}>
                {t("about.cta.families")}
              </Link>
            </div>
          </article>

          <article className="card card--accent stack-xs">
            <p className="soft">{tutors}</p>
            <ul className="stack-xs" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {tutorPoints.map((key) => (
                <li key={key} className="row" style={{ alignItems: "flex-start", gap: "0.5rem" }}>
                  <span aria-hidden="true" style={{ color: "var(--accent-strong)", lineHeight: 1.5 }}>
                    ✓
                  </span>
                  <span className="soft">{t(key, { percent })}</span>
                </li>
              ))}
            </ul>
            <div className="row">
              <Link className="btn btn--outline btn--sm" href={`/${locale}/pricing`}>
                {t("about.cta.tutors")}
              </Link>
            </div>
          </article>
        </div>

        <div className="card stack-xs">
          <h2 style={{ fontSize: "1.05rem" }}>{t("brand.tagline")}</h2>
          <p className="soft" style={{ maxWidth: "75ch" }}>
            {closing}
          </p>
          <div className="row">
            <Link className="btn btn--outline btn--sm" href={`/${locale}/legal/guarantee`}>
              {t("guarantee.cta")}
            </Link>
            <Link className="btn btn--quiet btn--sm" href={`/${locale}/legal/privacy`}>
              {t("legal.privacy.title")}
            </Link>
            <a className="btn btn--quiet btn--sm" href={`mailto:${settings.supportEmail}`}>
              {settings.supportEmail}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
