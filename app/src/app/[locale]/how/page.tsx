import type { Metadata } from "next";

import { createTranslator, type Locale } from "@/lib/i18n";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = createTranslator(locale as Locale);
  return { title: t("nav.how"), description: t("home.how.subtitle"), alternates: { canonical: `/${locale}/how` } };
}

export default async function HowPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  const t = createTranslator(locale);
  const steps = [1, 2, 3, 4] as const;

  return (
    <>
      <section className="section section--tight" style={{ background: "#fff", borderBlockEnd: "1px solid var(--line)" }}>
        <div className="shell stack-sm">
          <span className="kicker tracked">{t("home.how.title")}</span>
          <h1 className="display display--section">{t("home.how.subtitle")}</h1>
          <p className="lead">{t("brand.statement")}</p>
        </div>
      </section>

      <section className="section">
        <div className="shell stack-lg">
          {steps.map((step, i) => (
            <article className="card step-row" key={step} data-reveal style={{ "--reveal-i": i } as React.CSSProperties}>
              <span className="step__n" aria-hidden="true">{String(step).padStart(2, "0")}</span>
              <div className="stack-xs">
                <h2 style={{ fontSize: "1.1rem" }}>{t(`home.how.step${step}.title` as never)}</h2>
                <p className="soft">{t(`home.how.step${step}.body` as never)}</p>
              </div>
            </article>
          ))}

          <div className="card stack-xs">
            <h2 style={{ fontSize: "1.05rem" }}>{t("home.safety.title")}</h2>
            <p className="soft">{t("home.safety.body")}</p>
          </div>
        </div>
      </section>
    </>
  );
}
