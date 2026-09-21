/**
 * Static preview harness.
 *
 * Renders the REAL page components to static HTML with the REAL compiled
 * stylesheet, so the design can be looked at (and broken by) before any
 * deployment. There is no Next.js build available in this environment, so the
 * harness composes the page the way app/[locale]/page.tsx does - using the same
 * components and the same props - and writes plain HTML for a browser to render.
 *
 * Run:  esbuild src/preview/render.tsx --bundle --platform=node --format=esm
 *       --alias:@=./src --alias:next/link=... --outfile=/tmp/render.mjs
 *       node /tmp/render.mjs <outDir>
 */
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync, copyFileSync, existsSync, cpSync } from "node:fs";
import path from "node:path";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/home/Hero";
import {
  BecomeTutorBand,
  FaqSection,
  FinalCta,
  Highlights,
  HowItWorks,
  SafetySection,
  StageStrip,
  SubjectGrid,
  WhyEdura,
} from "@/components/home/Sections";
import { TutorCard } from "@/components/tutors/TutorCard";
import { TutorProfileHeader } from "@/components/tutors/TutorProfileHeader";
import { createTranslator, localeDir, localeMeta, type Locale } from "@/lib/i18n";
import { demoAreas, demoStages, demoSubjects, DEMO_TUTORS } from "@/lib/data/demo";

const outDir = process.argv[2] ?? "/tmp/edura-preview";
mkdirSync(outDir, { recursive: true });

function page(locale: Locale): string {
  const t = createTranslator(locale);
  const subjects = demoSubjects(locale);
  const stages = demoStages(locale);
  const areas = demoAreas(locale);
  const tutors = DEMO_TUTORS[locale];

  const body = (
    <>
      <Hero
        locale={locale}
        subjects={subjects}
        stages={stages}
        areas={areas}
        photoUrl={null}
      />
      <HowItWorks locale={locale} />
      <section className="section" id="tutors">
        <div className="shell">
          <div
            className="section__head row--between"
            style={{ display: "flex", alignItems: "flex-end", gap: "1rem", flexWrap: "wrap", maxWidth: "none" }}
          >
            <div className="stack-xs">
              <span className="kicker tracked">{t("home.featured.title")}</span>
              <h2 className="display display--section">{t("home.featured.subtitle")}</h2>
            </div>
            <a className="btn btn--outline btn--sm" href={`/${locale}/tutors`}>
              {t("cta.seeAll")}
              <span className="btn__arrow" aria-hidden="true">
                →
              </span>
            </a>
          </div>
          <div className="grid grid--3">
            {tutors.slice(0, 3).map((tutor) => (
              <TutorCard key={tutor.id} locale={locale} tutor={tutor} />
            ))}
          </div>
        </div>
      </section>
      <SubjectGrid locale={locale} subjects={subjects} />
      <StageStrip locale={locale} stages={stages} />
      <Highlights locale={locale} />
      <WhyEdura locale={locale} />
      <SafetySection locale={locale} />
      <FaqSection locale={locale} />
      <BecomeTutorBand locale={locale} photoUrl={null} />
      <FinalCta locale={locale} />
    </>
  );

  return renderToStaticMarkup(
    <html lang={localeMeta[locale].htmlLang} dir={localeDir[locale]} className="has-motion">
      <body>
        <Header locale={locale} />
        <main id="main">{body}</main>
        <Footer locale={locale} platformName={t("brand.name")} whatsappNumber="+97366661238" supportEmail="support@edura.bh" />
      </body>
    </html>,
  );
}

function tutorProfilePage(locale: Locale): string {
  const tutor = DEMO_TUTORS[locale][0]!;
  return renderToStaticMarkup(
    <html lang={localeMeta[locale].htmlLang} dir={localeDir[locale]} className="has-motion">
      <body>
        <Header locale={locale} />
        <main id="main">
          <TutorProfileHeader locale={locale} tutor={tutor} subjects={demoSubjects(locale)} />
          <section className="section">
            <div className="shell grid grid--2">
              <div className="card stack-sm">
                <h2 className="display display--section" style={{ fontSize: "var(--text-h3)" }}>
                  {createTranslator(locale)("profile.about")}
                </h2>
                <p className="soft">{tutor.bio}</p>
              </div>
              <div className="panel">
                <div className="panel__head">
                  <strong>{createTranslator(locale)("booking.title")}</strong>
                </div>
                <div className="panel__body stack-sm">
                  <div className="field">
                    <label className="label" htmlFor="p-subject">
                      {createTranslator(locale)("booking.subject.select")}
                    </label>
                    <select id="p-subject" className="select">
                      {tutor.subjects.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <button type="button" className="btn btn--primary">
                    {createTranslator(locale)("profile.bookCta")}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </main>
        <Footer locale={locale} platformName={createTranslator(locale)("brand.name")} whatsappNumber="+97366661238" supportEmail="support@edura.bh" />
      </body>
    </html>,
  );
}

const previewCss = "app.css";

/**
 * The preview has no MotionRoot (no hydration in static HTML), so this mirrors
 * what it does: reveal everything, and apply the same parallax maths on scroll.
 * Keeping the reveal classes means the preview exercises the real hidden state
 * and the real transition rather than a simplified one.
 */
const PREVIEW_SCRIPT = `
(function(){
  var reveal = function(){ document.querySelectorAll('[data-reveal]').forEach(function(el){ el.classList.add('is-revealed'); }); };
  document.addEventListener('DOMContentLoaded', reveal);
  window.addEventListener('load', reveal);
  var layers = [].slice.call(document.querySelectorAll('[data-parallax]'));
  var apply = function(){
    var vh = window.innerHeight;
    layers.forEach(function(layer){
      var rect = layer.getBoundingClientRect();
      var progress = (rect.top + rect.height/2 - vh/2) / vh;
      var shift = Math.max(-1, Math.min(1, progress)) * 0.04 * rect.height;
      layer.style.setProperty('--parallax-y', (-shift).toFixed(2) + 'px');
    });
  };
  apply();
  window.addEventListener('scroll', apply, {passive:true});
  window.addEventListener('resize', apply, {passive:true});
})();
`;
for (const locale of ["ar", "en"] as Locale[]) {
  const html = (content: string) =>
    content.replace(
      "<body",
      `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
        `<link rel="stylesheet" href="./${previewCss}?v=${Date.now()}"><script>${PREVIEW_SCRIPT}</script></head><body`,
    );
  writeFileSync(path.join(outDir, `home-${locale}.html`), html(page(locale)));
  writeFileSync(path.join(outDir, `tutor-${locale}.html`), html(tutorProfilePage(locale)));
}

// fonts: the compiled CSS references /fonts/... - mirror them next to the HTML
const fontSrc = path.join(process.cwd(), "public", "fonts");
if (existsSync(fontSrc)) cpSync(fontSrc, path.join(outDir, "fonts"), { recursive: true });

const brandSrc = path.join(process.cwd(), "public", "brand");
if (existsSync(brandSrc)) cpSync(brandSrc, path.join(outDir, "brand"), { recursive: true });

console.log("preview written to", outDir);
