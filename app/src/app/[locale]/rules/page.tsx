import type { Metadata } from "next";
import Link from "next/link";

import { createTranslator, type Locale } from "@/lib/i18n";
import { listSubjects, listStages } from "@/lib/data/catalog";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator(locale as Locale);
  return { title: t("nav.about"), description: t("brand.metaDescription"), alternates: { canonical: `/${locale}/rules` } };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  const t = createTranslator(locale);
  const [subjects, stages] = await Promise.all([listSubjects(locale), listStages(locale)]);

  return (
    <section className="section">
      <div className="shell legal-layout">
        <header className="stack-sm">
          <h1 className="display display--section">{t("brand.tagline")}</h1>
          <p className="lead">{t("brand.statement")}</p>
        </header>

        <div className="grid grid--2">
          <div className="card stack-xs">
            <h2 style={{ fontSize: "1.05rem" }}>{t("home.subjects.title")}</h2>
            <div className="row" style={{ gap: "0.4rem" }}>
              {subjects.map((s) => (
                <span className="chip chip--pale" key={s.id}>{s.name}</span>
              ))}
            </div>
          </div>
          <div className="card stack-xs">
            <h2 style={{ fontSize: "1.05rem" }}>{t("home.stages.title")}</h2>
            <div className="row" style={{ gap: "0.4rem" }}>
              {stages.map((s) => (
                <span className="chip" key={s.id}>{s.name}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="card stack-xs">
          <h2 style={{ fontSize: "1.05rem" }}>{t("home.safety.title")}</h2>
          <p className="soft">{t("home.safety.body")}</p>
          <div className="row">
            {["terms", "privacy", "safety", "cancellation", "refund", "tutor-terms"].map((doc) => (
              <Link className="btn btn--outline btn--sm" key={doc} href={`/${locale}/legal/${doc}`}>
                {t(`legal.${doc === "tutor-terms" ? "tutorTerms" : doc}.title` as never)}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
