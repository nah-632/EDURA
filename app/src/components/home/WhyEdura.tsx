import { createTranslator, type Locale } from "@/lib/i18n";
import { Reveal } from "./Reveal";

/**
 * "Why Edura" — the trust section.
 *
 * Refero anti-slop audit (2026-10-06) flagged this as the classic generated
 * pattern: four identical cards in a grid, no iconography, copy doing all the
 * work. Replaced with a numbered ledger: each point is a wide row with an
 * inline hand-drawn SVG glyph in the brand's turquoise, the number set in the
 * display face, and a hairline rule between rows — closer to a manifesto than
 * a card grid. Real layout variation, brand-native iconography, and the copy
 * stays the reviewed bilingual text.
 */
const POINTS = [
  { id: 1, tone: "var(--brand)", d: "M4 12.5l4.5 4.5L20 6.5" },            // verification check
  { id: 2, tone: "var(--accent)", d: "M12 3v18M8 7h6.5a3.5 3.5 0 010 7H8h7a3.5 3.5 0 010 7" }, // transparent price (BHD)
  { id: 3, tone: "var(--navy)", d: "M12 21s-7-5.5-7-11a7 7 0 0114 0c0 5.5-7 11-7 11z" },       // Bahrain locator
  { id: 4, tone: "var(--ok)", d: "M6 10V8a6 6 0 0112 0v2M4 10h16v9H4zM12 14v2" },             // data lock
] as const;

export function WhyEdura({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);

  return (
    <section className="section section--pale">
      <div className="shell why__shell">
        <div className="section__head">
          <h2 className="display display--section">{t("brand.tagline")}</h2>
        </div>

        <ol className="why__ledger">
          {POINTS.map(({ id, tone, d }, i) => (
            <Reveal as="li" key={id} index={i} className="why__row">
              <span className="why__glyph" aria-hidden="true" style={{ color: tone }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d={d} />
                </svg>
              </span>
              <div className="why__body">
                <h3 className="why__title">{t(`home.why.point${id}.title` as never)}</h3>
                <p className="why__text">{t(`home.why.point${id}.body` as never)}</p>
              </div>
              <span className="why__num" aria-hidden="true">
                {String(id).padStart(2, "0")}
              </span>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
